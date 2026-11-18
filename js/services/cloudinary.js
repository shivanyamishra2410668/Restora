const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export function optimizeCloudinaryImage(url, width = 800) {
  if (!url || !url.includes('/image/upload/')) return url || '';
  return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${width},c_limit/`);
}

export async function uploadProductImage(file) {
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Add the Cloudinary cloud name and upload preset to .env.local, then restart the app.');
  }
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, WebP, or AVIF image.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Image must be 8 MB or smaller.');

  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', uploadPreset);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
    method: 'POST',
    body
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Cloudinary image upload failed.');
  if (!result.secure_url) throw new Error('Cloudinary did not return a secure image URL.');
  return result.secure_url;
}
