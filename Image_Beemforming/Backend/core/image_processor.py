import numpy as np
import cv2

class ImageProcessor:
    def __init__(self, filename=None):
        self.filename = filename
        self.original_data = None  # The raw grayscale image
        self.fft_shift = None      # The shifted FFT data (Complex)
        self.magnitude = None      # Magnitude spectrum
        self.phase = None          # Phase spectrum
        self.real = None           # Real component
        self.imaginary = None      # Imaginary component
        self.shape = None          # (height, width)

    def load_image(self, filepath):
        """Loads an image, converts to grayscale, and computes FFT."""
        img = cv2.imread(filepath, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Could not load image: {filepath}")
        
        self.original_data = img
        self.shape = img.shape
        self._compute_fft()

    def resize(self, new_width, new_height):
        """Resizes the image and recomputes FFT."""
        if self.original_data is None:
            return
        
        self.original_data = cv2.resize(self.original_data, (new_width, new_height), interpolation=cv2.INTER_AREA)
        self.shape = self.original_data.shape
        self._compute_fft()

    def _compute_fft(self):
        """Computes FFT and caches all components."""
        if self.original_data is None:
            return

        f = np.fft.fft2(self.original_data)
        self.fft_shift = np.fft.fftshift(f)
        
        # Cache components
        self.magnitude = np.abs(self.fft_shift)
        self.phase = np.angle(self.fft_shift)
        self.real = np.real(self.fft_shift)
        self.imaginary = np.imag(self.fft_shift)

    def get_component_display(self, component_type):
        """
        Returns a uint8 image for display based on type:
        'magnitude', 'phase', 'real', 'imaginary'
        """
        if self.original_data is None:
            return None

        data = None
        if component_type == 'magnitude':
            # Log scale for magnitude visibility
            data = 20 * np.log(self.magnitude + 1)
        elif component_type == 'phase':
            data = self.phase
        elif component_type == 'real':
            # Log scale usually helps visualize real/imag structures too, 
            # but standard linear normalization is safer for raw components
            data = np.log(np.abs(self.real) + 1)
        elif component_type == 'imaginary':
            data = np.log(np.abs(self.imaginary) + 1)
        
        if data is None:
            return None

        # Normalize to 0-255 for display
        norm_img = cv2.normalize(data, None, 0, 255, cv2.NORM_MINMAX)
        return norm_img.astype(np.uint8)