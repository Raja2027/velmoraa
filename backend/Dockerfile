# Use official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies required for OpenCV and deepface
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download ArcFace weights so the container doesn't hang on first request
# Deepface stores weights in ~/.deepface/weights
RUN python -c "from deepface import DeepFace; import cv2; import numpy as np; DeepFace.represent(np.zeros((224, 224, 3), dtype=np.uint8), model_name='ArcFace', enforce_detection=False)" || true

# Copy the current directory contents into the container at /app
COPY . .

# Expose port 7860 (Hugging Face Spaces default port)
EXPOSE 7860

# Define environment variable
ENV HOST=0.0.0.0
ENV PORT=7860

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
