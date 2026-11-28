"""Bounded inline images accepted by the workstation's vision requests."""

import base64

MAX_IMAGES = 3
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_IMAGE_URL_LENGTH = 23 + 4 * ((MAX_IMAGE_BYTES + 2) // 3)
IMAGE_TYPES = {"data:image/jpeg;base64": ("jpg", b"\xff\xd8\xff"),
               "data:image/png;base64": ("png", b"\x89PNG")}


def decode_image_url(value: str) -> tuple[str, bytes]:
    if not isinstance(value, str) or len(value) > MAX_IMAGE_URL_LENGTH:
        raise ValueError("图片格式不匹配或超过 4 MB")
    prefix, _, encoded = value.partition(",")
    if prefix not in IMAGE_TYPES:
        raise ValueError("仅支持 JPEG 或 PNG Data URL")
    extension, signature = IMAGE_TYPES[prefix]
    image = base64.b64decode(encoded, validate=True)
    if len(image) > MAX_IMAGE_BYTES or not image.startswith(signature):
        raise ValueError("图片格式不匹配或超过 4 MB")
    return extension, image
