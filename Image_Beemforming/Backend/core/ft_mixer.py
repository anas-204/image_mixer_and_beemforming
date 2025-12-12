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

    def adjust_image_bc(self, index, brightness, contrast):
        if 0 <= index < 4:
            self.images[index].apply_brightness_contrast(brightness, contrast)

    def unify_sizes(self):
        valid_images = [img for img in self.images if img.original_data is not None]
        if not valid_images:
            return

        min_h = min(img.shape[0] for img in valid_images)
        min_w = min(img.shape[1] for img in valid_images)

        for img in valid_images:
            if img.shape[0] != min_h or img.shape[1] != min_w:
                img.resize(min_w, min_h)

    def mix(self, weights_1, weights_2, region_settings_1, region_settings_2, global_region, mode):
        """
        Mixes images with granular control.
        weights_1: List of 4 floats for Component 1 (Mag or Real)
        weights_2: List of 4 floats for Component 2 (Phase or Imag)
        region_settings_1: List of 4 strings ('inner'/'outer') for Comp 1
        region_settings_2: List of 4 strings ('inner'/'outer') for Comp 2
        global_region: Dict {x, y, w, h} (normalized 0-1)
        mode: 'magnitude_phase' or 'real_imaginary'
        """
        valid_images = [img for img in self.images if img.original_data is not None]
        if not valid_images:
            return None

        base_h, base_w = valid_images[0].shape
        
        # 1. Create the Global Masks (Inner and Outer)
        mask_inner = np.zeros((base_h, base_w), dtype=np.float64)
        
        if global_region:
            rx = int(global_region['x'] * base_w)
            ry = int(global_region['y'] * base_h)
            rw = int(global_region['w'] * base_w)
            rh = int(global_region['h'] * base_h)
            
            rx = max(0, min(rx, base_w))
            ry = max(0, min(ry, base_h))
            rw = max(0, min(rw, base_w - rx))
            rh = max(0, min(rh, base_h - ry))
            
            if rw > 0 and rh > 0:
                mask_inner[ry:ry+rh, rx:rx+rw] = 1.0
        
        mask_outer = 1.0 - mask_inner

        # 2. Accumulate Components
        # Initialize accumulators
        comp1_acc = np.zeros((base_h, base_w), dtype=np.float64)
        comp2_acc = np.zeros((base_h, base_w), dtype=np.float64)

        for i in range(4):
            img = self.images[i]
            if img.original_data is None: continue

            # --- Select Data Sources based on Mode ---
            if mode == 'real_imaginary':
                data1 = img.real
                data2 = img.imaginary
            else: # magnitude_phase
                data1 = img.magnitude
                data2 = img.phase

            # --- Apply Region Logic for Component 1 ---
            # If setting is 'inner', we keep ONLY inner part (data * mask_inner)
            # If setting is 'outer', we keep ONLY outer part (data * mask_outer)
            mask1 = mask_inner if region_settings_1[i] == 'inner' else mask_outer
            comp1_acc += data1 * mask1 * weights_1[i]

            # --- Apply Region Logic for Component 2 ---
            mask2 = mask_inner if region_settings_2[i] == 'inner' else mask_outer
            # Special case for Phase: 0 phase outside mask is mathematically fine
            comp2_acc += data2 * mask2 * weights_2[i]

        # 3. Recombine and Inverse FFT
        if mode == 'real_imaginary':
            combined_complex = comp1_acc + 1j * comp2_acc
        else: # magnitude_phase
            combined_complex = comp1_acc * np.exp(1j * comp2_acc)

        f_ishift = np.fft.ifftshift(combined_complex)
        img_back = np.fft.ifft2(f_ishift)
        img_back = np.abs(img_back)

        return cv2.normalize(img_back, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)