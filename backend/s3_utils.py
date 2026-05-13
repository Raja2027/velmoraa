import os
import uuid
import json
import mimetypes
from urllib.parse import urlparse, unquote
from fastapi import UploadFile

S3_BUCKET_NAME = (
    os.getenv("S3_BUCKET_NAME")
    or os.getenv("GCS_BUCKET_NAME")
    or os.getenv("GOOGLE_CLOUD_STORAGE_BUCKET")
)
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
GCS_SERVICE_KEY = os.getenv("GCS_SERVICE_ACCOUNT_KEY")  # JSON string of service account key
MEDIA_DELIVERY_MODE = os.getenv("MEDIA_DELIVERY_MODE", "proxy").lower()

# Try google-cloud-storage first (native GCS), fall back to boto3
gcs_bucket = None
s3_client = None

if S3_BUCKET_NAME and (GCS_SERVICE_KEY or "googleapis" in (S3_ENDPOINT_URL or "")):
    # Use google-cloud-storage directly — most reliable for GCS
    try:
        from google.cloud import storage
        from google.oauth2 import service_account

        if GCS_SERVICE_KEY:
            creds_dict = json.loads(GCS_SERVICE_KEY)
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            gcs_client = storage.Client(credentials=credentials, project=creds_dict.get("project_id"))
        else:
            # Try HMAC keys via boto3 as fallback
            import boto3
            from botocore.config import Config
            AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
            AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
            if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
                s3_client = boto3.client(
                    "s3",
                    endpoint_url="https://storage.googleapis.com",
                    aws_access_key_id=AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
                    config=Config(signature_version="s3v4", s3={"addressing_style": "path"})
                )
                print(f"[S3] boto3 client initialized for GCS")
            gcs_client = None

        if GCS_SERVICE_KEY:
            gcs_bucket = gcs_client.bucket(S3_BUCKET_NAME)
            print(f"[GCS] Native client initialized for bucket: {S3_BUCKET_NAME}")
    except Exception as e:
        print(f"[GCS] Failed to init: {e}")
else:
    # Pure AWS S3
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and S3_BUCKET_NAME:
        import boto3
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=os.getenv("AWS_REGION_NAME", "us-east-1")
        )
        print(f"[S3] AWS client initialized for bucket: {S3_BUCKET_NAME}")


async def upload_file_to_s3(file: UploadFile) -> str:
    """Upload a file to GCS/S3 or save locally as fallback."""
    file_ext = file.filename.split(".")[-1] if file.filename else "jpg"
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    file_content = await file.read()

    # Method 1: Native GCS upload
    if gcs_bucket:
        try:
            blob = gcs_bucket.blob(unique_filename)
            blob.cache_control = "public, max-age=31536000"
            blob.upload_from_string(file_content, content_type=file.content_type)
            if MEDIA_DELIVERY_MODE == "public":
                try:
                    blob.make_public()
                except Exception as e:
                    print(f"[GCS] make_public skipped/failed: {e}")
            url = blob.public_url
            print(f"[GCS] Upload success: {url}")
            return url if MEDIA_DELIVERY_MODE == "public" else f"/media/{unique_filename}"
        except Exception as e:
            print(f"[GCS] Upload failed: {e}")

    # Method 2: boto3 S3-compatible upload
    if s3_client:
        try:
            s3_client.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=unique_filename,
                Body=file_content,
                ContentType=file.content_type
            )
            if S3_ENDPOINT_URL and "googleapis" in S3_ENDPOINT_URL:
                url = f"https://storage.googleapis.com/{S3_BUCKET_NAME}/{unique_filename}"
            else:
                region = os.getenv("AWS_REGION_NAME", "us-east-1")
                url = f"https://{S3_BUCKET_NAME}.s3.{region}.amazonaws.com/{unique_filename}"
            print(f"[S3] Upload success: {url}")
            return url if MEDIA_DELIVERY_MODE == "public" else f"/media/{unique_filename}"
        except Exception as e:
            print(f"[S3] Upload failed: {e}")

    # Method 3: Local fallback
    print("[LOCAL] Saving file locally as fallback")
    upload_dir = "public/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    local_path = os.path.join(upload_dir, unique_filename)
    with open(local_path, "wb") as f:
        f.write(file_content)
    return f"/uploads/{unique_filename}"


def get_media_bytes(key: str) -> tuple[bytes, str]:
    """Read uploaded media from GCS/S3 or the local fallback directory."""
    normalized_key = media_key_from_url(key)
    content_type = mimetypes.guess_type(normalized_key)[0] or "application/octet-stream"

    if gcs_bucket:
        try:
            blob = gcs_bucket.blob(normalized_key)
            data = blob.download_as_bytes()
            return data, blob.content_type or content_type
        except Exception as e:
            print(f"[GCS] Read failed for {normalized_key}: {e}")

    if s3_client:
        try:
            response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=normalized_key)
            return response["Body"].read(), response.get("ContentType") or content_type
        except Exception as e:
            print(f"[S3] Read failed for {normalized_key}: {e}")

    local_path = os.path.join("public", "uploads", normalized_key)
    if not os.path.isfile(local_path):
        raise FileNotFoundError(normalized_key)
    with open(local_path, "rb") as f:
        return f.read(), content_type


def media_key_from_url(value: str) -> str:
    """Extract the object key from local media routes or public GCS URLs."""
    if not value:
        return ""

    if value.startswith("/media/"):
        return unquote(value.removeprefix("/media/").lstrip("/"))

    if value.startswith("/uploads/"):
        return unquote(value.removeprefix("/uploads/").lstrip("/"))

    if value.startswith("http"):
        parsed = urlparse(value)
        host = parsed.netloc.lower()
        path = parsed.path.lstrip("/")
        if host == "storage.googleapis.com":
            parts = path.split("/", 1)
            return unquote(parts[1] if len(parts) > 1 else parts[0])
        if host.endswith(".storage.googleapis.com"):
            return unquote(path)
        return unquote(os.path.basename(path))

    return unquote(value.lstrip("/"))


def delete_media_file(value: str) -> None:
    """Best-effort delete for media stored in GCS/S3/local fallback."""
    normalized_key = media_key_from_url(value)
    if not normalized_key:
        return

    if gcs_bucket:
        try:
            gcs_bucket.blob(normalized_key).delete()
            return
        except Exception as e:
            print(f"[GCS] Delete failed for {normalized_key}: {e}")

    if s3_client:
        try:
            s3_client.delete_object(Bucket=S3_BUCKET_NAME, Key=normalized_key)
            return
        except Exception as e:
            print(f"[S3] Delete failed for {normalized_key}: {e}")

    local_path = os.path.join("public", "uploads", normalized_key)
    if os.path.isfile(local_path):
        try:
            os.remove(local_path)
        except Exception as e:
            print(f"[LOCAL] Delete failed for {normalized_key}: {e}")
