import numpy as np
import cv2

class ImageProcessor:
    def __init__(self, filename=None):
        self.filename = filename
        self.original_data = None
        self.processed_data = None
        self.shape = None
        
        # FFT Components
        self.fft_shift = None
        self.magnitude = None
        self.phase = None
        self.real = None
        self.imaginary = None
        
        # Display settings
        self.brightness = 0.0
        self.contrast = 1.0

    def load_image(self, filepath):
        img = cv2.imread(filepath, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Could not load image: {filepath}")
        
        self.original_data = img
        self.processed_data = img.copy()
        self.shape = img.shape
        self._compute_fft()

    def resize(self, new_width, new_height):
        if self.original_data is None:
            return
        
        self.original_data = cv2.resize(self.original_data, (new_width, new_height), interpolation=cv2.INTER_AREA)
        self.apply_brightness_contrast(self.brightness, self.contrast)
        self.shape = self.original_data.shape

    def apply_brightness_contrast(self, brightness, contrast):
        if self.original_data is None:
            return

        self.brightness = brightness
        self.contrast = contrast

        img_float = self.original_data.astype(np.float32) / 255.0
        img_float = img_float + brightness
        img_float = (img_float - 0.5) * contrast + 0.5
        
        img_clipped = np.clip(img_float * 255, 0, 255).astype(np.uint8)
        self.processed_data = img_clipped
        self._compute_fft()

    def _compute_fft(self):
        if self.processed_data is None:
            return

        f = np.fft.fft2(self.processed_data)
        self.fft_shift = np.fft.fftshift(f)
        
        self.magnitude = np.abs(self.fft_shift)
        self.phase = np.angle(self.fft_shift)
        self.real = np.real(self.fft_shift)
        self.imaginary = np.imag(self.fft_shift)

    def get_component_display(self, component_type):
        if self.processed_data is None:
            return None

        data = None
        if component_type == 'magnitude':
            data = 20 * np.log(self.magnitude + 1)
        elif component_type == 'phase':
            data = self.phase
        elif component_type == 'real':
            data = 20 * np.log(np.abs(self.real) + 1)
        elif component_type == 'imaginary':
            # Imaginary can be negative, visualize absolute or shifted
            data = np.abs(self.imaginary)
            data = 20 * np.log(data + 1) # Log scale often helps visibility
        
        if data is None: return None

        return cv2.normalize(data, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    def get_image_display(self):
        return self.processed_data