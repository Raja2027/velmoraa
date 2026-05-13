import os
import tempfile
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from deepface import DeepFace


MODEL_NAME = "ArcFace"
SEARCH_DISTANCE_CUTOFF = 0.72
FALLBACK_DISTANCE_CUTOFF = 2.0
STRONG_MATCH_DISTANCE = 0.38
LIKELY_MATCH_DISTANCE = 0.50
POST_UPDATE_DISTANCE_CUTOFF = 0.65
MIN_FACE_AREA_RATIO = 0.008
MIN_BLUR_SCORE = 12.0
LOW_QUALITY_FACE_AREA_RATIO = 0.008
LOW_QUALITY_BLUR_SCORE = 12.0
MIN_VIDEO_SAMPLES = 2
VIDEO_SAMPLE_COUNT = 16
VIDEO_CLUSTER_DISTANCE = 0.65
VIDEO_OUTLIER_DISTANCE = 0.60


@dataclass
class FaceEmbeddingCandidate:
    embedding: list[float]
    quality_score: float
    area_ratio: float
    blur_score: float
    brightness: float
    confidence: float
    frame_index: int | None = None
    face_index: int = 0
    facial_area: dict[str, Any] | None = None


@dataclass
class RobustEmbeddingResult:
    embedding: list[float]
    buffer_vectors: list[list[float]]
    frames_used: int
    candidates_seen: int
    average_quality: float


def normalize_embedding(embedding: list[float] | np.ndarray) -> np.ndarray:
    vec = np.asarray(embedding, dtype=np.float32)
    norm = float(np.linalg.norm(vec))
    if not np.isfinite(norm) or norm <= 1e-12:
        raise ValueError("Embedding vector has zero or invalid norm")
    return vec / norm


def cosine_distance(left: list[float] | np.ndarray, right: list[float] | np.ndarray) -> float:
    left_vec = normalize_embedding(left)
    right_vec = normalize_embedding(right)
    return float(1.0 - np.dot(left_vec, right_vec))


def match_confidence(distance: float) -> float:
    """
    Convert ArcFace cosine distance to a conservative UI confidence.
    Results beyond SEARCH_DISTANCE_CUTOFF are fallback guesses only.
    """
    distance = float(distance)
    if distance >= FALLBACK_DISTANCE_CUTOFF:
        return 0.0
    if distance <= STRONG_MATCH_DISTANCE:
        score = 80.0 + ((STRONG_MATCH_DISTANCE - distance) / STRONG_MATCH_DISTANCE) * 19.5
    elif distance <= LIKELY_MATCH_DISTANCE:
        span = LIKELY_MATCH_DISTANCE - STRONG_MATCH_DISTANCE
        score = 60.0 + ((LIKELY_MATCH_DISTANCE - distance) / span) * 20.0
    else:
        if distance <= SEARCH_DISTANCE_CUTOFF:
            span = SEARCH_DISTANCE_CUTOFF - LIKELY_MATCH_DISTANCE
            score = 25.0 + ((SEARCH_DISTANCE_CUTOFF - distance) / span) * 35.0
        else:
            span = FALLBACK_DISTANCE_CUTOFF - SEARCH_DISTANCE_CUTOFF
            score = 1.0 + ((FALLBACK_DISTANCE_CUTOFF - distance) / span) * 24.0
    return round(max(1.0, min(99.5, score)), 2)


def match_level(distance: float) -> str:
    if distance <= STRONG_MATCH_DISTANCE:
        return "strong"
    if distance <= LIKELY_MATCH_DISTANCE:
        return "likely"
    if distance <= SEARCH_DISTANCE_CUTOFF:
        return "possible"
    return "low"


def is_low_quality_query(candidate: FaceEmbeddingCandidate) -> bool:
    return (
        candidate.area_ratio < LOW_QUALITY_FACE_AREA_RATIO
        or candidate.blur_score < LOW_QUALITY_BLUR_SCORE
    )


def _decode_image(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_cv is None:
        raise ValueError("Could not decode image")
    return img_cv


def _face_area_ratio(facial_area: dict[str, Any] | None, image_shape: tuple[int, ...]) -> float:
    if not facial_area:
        return 0.0
    image_h, image_w = image_shape[:2]
    face_w = max(0, int(facial_area.get("w", 0)))
    face_h = max(0, int(facial_area.get("h", 0)))
    image_area = max(1, image_w * image_h)
    return float((face_w * face_h) / image_area)


def _face_crop(img_cv: np.ndarray, facial_area: dict[str, Any] | None) -> np.ndarray:
    if not facial_area:
        return img_cv
    image_h, image_w = img_cv.shape[:2]
    x = max(0, int(facial_area.get("x", 0)))
    y = max(0, int(facial_area.get("y", 0)))
    w = max(1, int(facial_area.get("w", image_w)))
    h = max(1, int(facial_area.get("h", image_h)))
    x2 = min(image_w, x + w)
    y2 = min(image_h, y + h)
    crop = img_cv[y:y2, x:x2]
    return crop if crop.size else img_cv


def _blur_score(face_img: np.ndarray) -> float:
    gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _brightness(face_img: np.ndarray) -> float:
    gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def _confidence(raw: Any) -> float:
    try:
        confidence = float(raw)
    except (TypeError, ValueError):
        return 0.5
    if confidence > 1.0:
        confidence = confidence / 100.0
    return max(0.0, min(1.0, confidence))


def _quality_score(
    confidence: float,
    area_ratio: float,
    blur: float,
    brightness: float,
) -> float:
    area_component = min(1.0, area_ratio / 0.08)
    blur_component = min(1.0, blur / 120.0)
    exposure_component = 1.0 - min(1.0, abs(brightness - 120.0) / 120.0)
    return float(
        0.35 * confidence
        + 0.25 * area_component
        + 0.25 * blur_component
        + 0.15 * exposure_component
    )


def extract_face_candidates(
    image_bytes: bytes,
    frame_index: int | None = None,
    require_quality: bool = False,
) -> list[FaceEmbeddingCandidate]:
    """
    Extract normalized ArcFace embeddings plus quality metadata for every detected face.
    """
    img_cv = _decode_image(image_bytes)

    try:
        results = DeepFace.represent(
            img_path=img_cv,
            model_name=MODEL_NAME,
            enforce_detection=True,
            align=True,
        )
    except ValueError:
        return []
    except Exception as e:
        raise RuntimeError(f"Unexpected error during face extraction: {str(e)}")

    if isinstance(results, dict):
        results = [results]

    candidates: list[FaceEmbeddingCandidate] = []
    for index, result in enumerate(results or []):
        raw_embedding = result.get("embedding")
        if raw_embedding is None:
            continue

        facial_area = result.get("facial_area") or {}
        crop = _face_crop(img_cv, facial_area)
        area_ratio = _face_area_ratio(facial_area, img_cv.shape)
        blur = _blur_score(crop)
        brightness = _brightness(crop)
        confidence = _confidence(result.get("face_confidence", result.get("confidence", 0.5)))
        quality_score = _quality_score(confidence, area_ratio, blur, brightness)

        if require_quality and (area_ratio < MIN_FACE_AREA_RATIO or blur < MIN_BLUR_SCORE):
            continue

        candidates.append(
            FaceEmbeddingCandidate(
                embedding=normalize_embedding(raw_embedding).tolist(),
                quality_score=quality_score,
                area_ratio=area_ratio,
                blur_score=blur,
                brightness=brightness,
                confidence=confidence,
                frame_index=frame_index,
                face_index=index,
                facial_area=facial_area,
            )
        )

    candidates.sort(key=lambda c: (c.quality_score, c.area_ratio), reverse=True)
    return candidates


def robust_centroid(
    vectors: list[list[float] | np.ndarray],
    qualities: list[float] | None = None,
    max_distance: float = VIDEO_OUTLIER_DISTANCE,
    min_keep: int = 1,
) -> tuple[list[float], list[list[float]]]:
    if not vectors:
        raise ValueError("No vectors available for centroid")

    kept = [normalize_embedding(vector) for vector in vectors]
    kept_qualities = list(qualities or [1.0] * len(kept))
    min_keep = max(1, min(min_keep, len(kept)))

    while len(kept) > min_keep:
        centroid = _weighted_centroid(kept, kept_qualities)
        distances = [cosine_distance(vector, centroid) for vector in kept]
        worst_index = int(np.argmax(distances))
        if distances[worst_index] <= max_distance:
            break
        kept.pop(worst_index)
        kept_qualities.pop(worst_index)

    centroid = _weighted_centroid(kept, kept_qualities)
    return centroid.tolist(), [vector.tolist() for vector in kept]


def _weighted_centroid(vectors: list[np.ndarray], qualities: list[float]) -> np.ndarray:
    weights = np.asarray([max(0.25, min(1.5, q)) for q in qualities], dtype=np.float32)
    stacked = np.vstack(vectors)
    centroid = np.average(stacked, axis=0, weights=weights)
    return normalize_embedding(centroid)


def _best_identity_cluster(
    candidates: list[FaceEmbeddingCandidate],
    min_samples: int,
) -> list[FaceEmbeddingCandidate]:
    best_members: list[FaceEmbeddingCandidate] = []
    best_score = -999999.0

    for anchor in candidates:
        by_frame: dict[int, tuple[float, FaceEmbeddingCandidate]] = {}
        for candidate in candidates:
            distance = cosine_distance(anchor.embedding, candidate.embedding)
            if distance > VIDEO_CLUSTER_DISTANCE:
                continue

            frame_key = candidate.frame_index if candidate.frame_index is not None else id(candidate)
            candidate_score = candidate.quality_score - distance
            existing = by_frame.get(frame_key)
            if existing is None or candidate_score > existing[0]:
                by_frame[frame_key] = (candidate_score, candidate)

        members = [item[1] for item in by_frame.values()]
        if len(members) < min_samples:
            continue

        centroid, kept_vectors = robust_centroid(
            [member.embedding for member in members],
            [member.quality_score for member in members],
            max_distance=VIDEO_OUTLIER_DISTANCE,
            min_keep=min_samples,
        )

        # Use index-based matching instead of fragile float comparison
        # kept_vectors are the vectors that survived outlier removal
        # Match them back to members by cosine distance (< tiny threshold)
        kept_members = []
        for member in members:
            member_vec = normalize_embedding(member.embedding)
            for kv in kept_vectors:
                if cosine_distance(member_vec, kv) < 0.001:
                    kept_members.append(member)
                    break

        if len(kept_members) < min_samples:
            continue

        distances = [cosine_distance(member.embedding, centroid) for member in kept_members]
        avg_distance = float(np.mean(distances)) if distances else 1.0
        avg_quality = float(np.mean([member.quality_score for member in kept_members]))
        score = len(kept_members) * 10.0 + avg_quality * 3.0 - avg_distance * 5.0
        if score > best_score:
            best_score = score
            best_members = kept_members

    return best_members


def get_robust_video_embedding(
    video_bytes: bytes,
    sample_count: int = VIDEO_SAMPLE_COUNT,
    min_samples: int = MIN_VIDEO_SAMPLES,
) -> RobustEmbeddingResult:
    """
    Sample a video, keep quality faces, cluster the same identity across frames,
    and return a normalized centroid plus the vectors used to build it.
    """
    tmp_path = ""
    cap = None
    try:
        # Detect format from magic bytes and use correct suffix
        suffix = ".webm" if video_bytes[:4] == b'\x1a\x45\xdf\xa3' else ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        print(f"[face_utils] Video saved as {suffix}, size={len(video_bytes)} bytes")

        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise ValueError("Could not read video")

        # Read ALL frames sequentially — CAP_PROP_FRAME_COUNT is unreliable for webm
        all_frames = []
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            all_frames.append(frame)

        print(f"[face_utils] Read {len(all_frames)} frames from video")

        if len(all_frames) == 0:
            raise ValueError("Could not read any video frames")

        # Sample evenly from all collected frames
        total_frames = len(all_frames)
        indices = np.linspace(0, total_frames - 1, min(sample_count, total_frames), dtype=int)
        candidates: list[FaceEmbeddingCandidate] = []
        for frame_index in sorted(set(int(index) for index in indices)):
            frame = all_frames[frame_index]
            ok, encoded = cv2.imencode(".jpg", frame)
            if not ok:
                continue
            candidates.extend(
                extract_face_candidates(
                    encoded.tobytes(),
                    frame_index=frame_index,
                    require_quality=False,
                )
            )

        print(f"[face_utils] Found {len(candidates)} face candidates across sampled frames")

        if len(candidates) < min_samples:
            raise ValueError(
                "Not enough clear face samples found. Use a brighter, steadier video with your face visible."
            )

        members = _best_identity_cluster(candidates, min_samples=min_samples)
        print(f"[face_utils] Identity cluster has {len(members)} members")
        if len(members) < min_samples:
            raise ValueError(
                "Could not find one consistent face across the video. Use a video with only your face centered."
            )

        centroid, buffer_vectors = robust_centroid(
            [member.embedding for member in members],
            [member.quality_score for member in members],
            max_distance=VIDEO_OUTLIER_DISTANCE,
            min_keep=min_samples,
        )

        return RobustEmbeddingResult(
            embedding=centroid,
            buffer_vectors=buffer_vectors,
            frames_used=len(buffer_vectors),
            candidates_seen=len(candidates),
            average_quality=float(np.mean([member.quality_score for member in members])),
        )
    finally:
        if cap is not None:
            cap.release()
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def get_face_embedding(image_bytes: bytes) -> list[float]:
    """
    Extract the best normalized ArcFace embedding from one image.
    """
    candidates = extract_face_candidates(image_bytes)
    if not candidates:
        raise ValueError("No faces detected in the image")
    return candidates[0].embedding


def get_all_face_embeddings(image_bytes: bytes) -> list[list[float]]:
    """
    Extract normalized ArcFace embeddings for all faces found in an image.
    """
    return [candidate.embedding for candidate in extract_face_candidates(image_bytes)]


def get_search_face_candidates(image_bytes: bytes, max_faces: int = 5) -> list[FaceEmbeddingCandidate]:
    # Search photos are often screenshots, full-body photos, or compressed crops.
    # Keep every detected face and let distance/ranking decide instead of rejecting early.
    candidates = extract_face_candidates(image_bytes, require_quality=False)
    if not candidates:
        raise ValueError("No faces detected in the search image")
    return candidates[:max_faces]


def update_embedding_buffer(
    stored_embedding: list[float],
    buffer_vectors: list[list[float]] | None,
    candidate_embedding: list[float],
    admission_distance: float = POST_UPDATE_DISTANCE_CUTOFF,
    max_buffer_size: int = 12,
) -> tuple[list[float] | None, list[list[float]], float]:
    """
    Safely admit a new face vector into a user's identity buffer.
    Returns (new_centroid, new_buffer, distance). new_centroid is None if rejected.
    """
    stored_vector = normalize_embedding(stored_embedding)
    candidate_vector = normalize_embedding(candidate_embedding)
    distance = cosine_distance(stored_vector, candidate_vector)
    existing_vectors = [normalize_embedding(vector).tolist() for vector in (buffer_vectors or [])]

    if distance > admission_distance:
        return None, existing_vectors, distance

    if not existing_vectors:
        existing_vectors = [stored_vector.tolist()]
    existing_vectors.append(candidate_vector.tolist())

    while len(existing_vectors) > max_buffer_size:
        centroid, _ = robust_centroid(existing_vectors, max_distance=1.0)
        distances = [cosine_distance(vector, centroid) for vector in existing_vectors]
        existing_vectors.pop(int(np.argmax(distances)))

    centroid, kept_vectors = robust_centroid(
        existing_vectors,
        max_distance=VIDEO_OUTLIER_DISTANCE,
        min_keep=min(3, len(existing_vectors)),
    )
    return centroid, kept_vectors, distance
