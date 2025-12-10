import numpy as np
import cv2
from .image_processor import ImageProcessor

class FTMixer:
    def __init__(self):
        self.images = [ImageProcessor(), ImageProcessor(), ImageProcessor(), ImageProcessor()]

    def update_image(self, index, filepath):
        if 0 <= index < 4:
            self.images[index].load_image(filepath)
            self.unify_sizes()

    def unify_sizes(self):
        valid_images = [img for img in self.images if img.original_data is not None]
        if not valid_images:
            return

        min_h = min(img.shape[0] for img in valid_images)
        min_w = min(img.shape[1] for img in valid_images)

        for img in valid_images:
            if img.shape[0] != min_h or img.shape[1] != min_w:
                img.resize(min_w, min_h)

    def mix(self, weights_mag, weights_phase, region_info=None):
        valid_images = [img for img in self.images if img.original_data is not None]
        if not valid_images:
            return None

        base_h, base_w = valid_images[0].shape
        
        mixed_mag = np.zeros((base_h, base_w), dtype=np.float64)
        mixed_phase = np.zeros((base_h, base_w), dtype=np.float64)

        # Create Region Mask
        # Default: All ones (pass everything)
        mask_inner = np.ones((base_h, base_w), dtype=np.float64)
        
        if region_info:
            # We assume inputs are normalized floats (0.0 to 1.0)
            # We usually mix frequencies with the Center being DC.
            # But the user draws on the "shifted" spectrum (center is middle of image).
            # So the rect coordinates correspond directly to the shifted FFT array indices.
            
            x_norm, y_norm = region_info['x'], region_info['y']
            w_norm, h_norm = region_info['w'], region_info['h']

            # Convert to pixels
            x = int(x_norm * base_w)
            y = int(y_norm * base_h)
            w = int(w_norm * base_w)
            h = int(h_norm * base_h)

            # Create the mask
            # Start with Zeros
            mask_inner = np.zeros((base_h, base_w), dtype=np.float64)
            
            # Set region to 1
            # Check bounds
            x = max(0, min(x, base_w))
            y = max(0, min(y, base_h))
            w = max(0, min(w, base_w - x))
            h = max(0, min(h, base_h - y))
            
            if w > 0 and h > 0:
                mask_inner[y:y+h, x:x+w] = 1.0

        mask_outer = 1.0 - mask_inner

        for i in range(4):
            img = self.images[i]
            if img.original_data is None:
                continue

            # Magnitude Region Logic
            m_mode = region_info['mag_modes'][i] if region_info else 'inner'
            if m_mode == 'inner':
                mag_contrib = img.magnitude * mask_inner
            else: # outer
                mag_contrib = img.magnitude * mask_outer
            
            # Phase Region Logic
            p_mode = region_info['phase_modes'][i] if region_info else 'inner'
            if p_mode == 'inner':
                phase_contrib = img.phase * mask_inner
            else: # outer
                phase_contrib = img.phase * mask_outer

            mixed_mag += mag_contrib * weights_mag[i]
            mixed_phase += phase_contrib * weights_phase[i]

        combined_complex = mixed_mag * np.exp(1j * mixed_phase)
        
        f_ishift = np.fft.ifftshift(combined_complex)
        img_back = np.fft.ifft2(f_ishift)
        img_back = np.abs(img_back)

        return cv2.normalize(img_back, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)