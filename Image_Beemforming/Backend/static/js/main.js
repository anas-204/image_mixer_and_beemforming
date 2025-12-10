// Global state for the region rectangle
// Coordinates are normalized (0.0 to 1.0) so they apply regardless of display size
let globalRegion = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }; // Default center box
let isDrawing = false;
let startX, startY;

// Canvas Contexts Store
const canvases = {}; 
const contexts = {};
const ftImages = {}; // Store the underlying image data (Image objects) for redraws

// Initialize Canvases
window.onload = function() {
    for (let i = 1; i <= 4; i++) {
        setupCanvas(i);
    }
};

function setupCanvas(id) {
    const canvas = document.getElementById(`ftCanvas${id}`);
    const ctx = canvas.getContext('2d');
    
    canvases[id] = canvas;
    contexts[id] = ctx;
    ftImages[id] = new Image();

    // Mouse Events for Drawing
    canvas.addEventListener('mousedown', (e) => startDrawing(e, id));
    canvas.addEventListener('mousemove', (e) => draw(e, id));
    canvas.addEventListener('mouseup', () => stopDrawing(id));
    canvas.addEventListener('mouseout', () => stopDrawing(id));
}

// --- Upload & FT Fetching ---

async function uploadImage(slotId) {
    const fileInput = document.getElementById(`file${slotId}`);
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`/upload/${slotId}`, { method: 'POST', body: formData });
        const data = await response.json();
        
        // Update Main Image
        document.getElementById(`img${slotId}`).src = `/${data.filepath}?t=${new Date().getTime()}`;
        
        // Automatically fetch and update the FT View
        updateFTDisplay(slotId);
        
    } catch (error) {
        console.error('Error uploading:', error);
    }
}

async function updateFTDisplay(slotId) {
    const type = document.getElementById(`ftSelect${slotId}`).value;
    
    try {
        const response = await fetch(`/component/${slotId}/${type}`);
        const data = await response.json();
        
        // Load into the JS Image object, then draw to canvas
        const img = ftImages[slotId];
        img.onload = () => {
            redrawCanvas(slotId);
            // Trigger update to mix just in case sizes changed
            updateMix(); 
        };
        img.src = `data:image/png;base64,${data.image_data}`;
        
    } catch (error) {
        console.error('Error fetching component:', error);
    }
}

// --- Canvas Drawing Logic ---

function redrawCanvas(id) {
    const canvas = canvases[id];
    const ctx = contexts[id];
    const img = ftImages[id];

    // Resize canvas to match display size (avoids stretching issues)
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // 1. Draw the FT Component Image
    if (img.src) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Draw the Selection Rectangle
    // Convert normalized coords (0.0-1.0) to pixels
    const rx = globalRegion.x * canvas.width;
    const ry = globalRegion.y * canvas.height;
    const rw = globalRegion.w * canvas.width;
    const rh = globalRegion.h * canvas.height;

    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]); // Dashed line
    ctx.strokeRect(rx, ry, rw, rh);
    
    // Optional: Semi-transparent fill to highlight selection
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
    ctx.fillRect(rx, ry, rw, rh);
}

function startDrawing(e, id) {
    isDrawing = true;
    const rect = canvases[id].getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
}

function draw(e, id) {
    if (!isDrawing) return;
    
    const canvas = canvases[id];
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Calculate width/height in pixels
    let w = currentX - startX;
    let h = currentY - startY;
    let x = startX;
    let y = startY;

    // Handle negative width/height (drawing backwards)
    if (w < 0) { x += w; w = Math.abs(w); }
    if (h < 0) { y += h; h = Math.abs(h); }

    // Normalize and Update Global State
    globalRegion = {
        x: x / canvas.width,
        y: y / canvas.height,
        w: w / canvas.width,
        h: h / canvas.height
    };

    // Redraw ALL canvases to show sync
    for (let i = 1; i <= 4; i++) {
        redrawCanvas(i);
    }
}

function stopDrawing(id) {
    if (isDrawing) {
        isDrawing = false;
        updateMix(); // Trigger backend update when mouse released
    }
}

// --- Mixing Logic ---

async function updateMix() {
    const weights_mag = {};
    const weights_phase = {};
    const region_modes_mag = {};
    const region_modes_phase = {};

    for (let i = 1; i <= 4; i++) {
        // Sliders
        const magVal = document.getElementById(`sliderMag${i}`).value;
        const phaseVal = document.getElementById(`sliderPhase${i}`).value;
        document.getElementById(`valMag${i}`).innerText = magVal;
        document.getElementById(`valPhase${i}`).innerText = phaseVal;
        
        weights_mag[`img${i}`] = parseFloat(magVal) / 100.0;
        weights_phase[`img${i}`] = parseFloat(phaseVal) / 100.0;

        // Radios
        const magRadio = document.querySelector(`input[name="regionMag${i}"]:checked`);
        const phaseRadio = document.querySelector(`input[name="regionPhase${i}"]:checked`);
        region_modes_mag[`img${i}`] = magRadio ? magRadio.value : 'inner';
        region_modes_phase[`img${i}`] = phaseRadio ? phaseRadio.value : 'inner';
    }

    // Backend needs exact pixels for processing. 
    // We assume the backend processes on the 'unified' size.
    // However, the backend doesn't know the canvas size.
    // We should send Normalized coordinates (0-1) and let backend map to image size.
    // OR we can map here if we know image size.
    // Safest: Send normalized, let backend multiply by image width/height.
    
    // *Wait*: The backend `ft_mixer.py` logic I wrote expects pixels (int). 
    // Let's modify the payload to send pixel coordinates relative to the *canvas* // and let backend logic re-map, OR simpler:
    // Update backend to accept normalized coordinates or just map it here.
    // Let's assume a standard reference size or pass percentages.
    
    // Let's convert normalized to a reference size (e.g., 200px) or better, 
    // pass the normalized values and handle in Python.
    
    // For now, to keep `ft_mixer.py` simple (which expects pixels), 
    // let's actually change the backend to accept normalized float coordinates?
    // No, let's stick to the current backend but send "implied" pixels.
    // Actually, `ft_mixer.py` `apply_region_mask` uses `x, y, w, h`.
    // Let's assume the backend will handle mapping if we pass raw pixels? 
    // No, backend doesn't know frontend canvas size.
    
    // Solution: Send normalized values in a separate key, 
    // update backend `ft_mixer.py` to use normalized values.
    
    // NOTE: For this specific step, I will calculate pixels based on the *first valid image*
    // but the frontend doesn't know the backend image size.
    // Let's update `ft_mixer.py` in the thought process?
    // Actually, I can't edit `ft_mixer.py` in this response (I already generated it).
    // I need to send what `ft_mixer.py` expects. 
    // `ft_mixer.py` expects: `x, y, w, h` as integers.
    // AND it uses: `w = min(base_w - x, w)`.
    // It implies x,y are in image pixel space.
    
    // Workaround: We will fetch the actual image dimensions from the first valid image 
    // (we can infer or just fix the mixing logic to be robust).
    // Actually, let's just make `ft_mixer.py` handle normalized coords in the next step.
    // Since I cannot change `ft_mixer` now without re-generating, 
    // I will assume the backend expects pixels. 
    // But wait, I can re-generate `ft_mixer.py` if I want to improve it!
    // Yes, I will regenerate `ft_mixer.py` to be smarter (accept normalized coords).
    
    const payload = {
        weights_mag: weights_mag,
        weights_phase: weights_phase,
        region_enabled: true,
        region: {
            x: globalRegion.x, // 0.0 - 1.0
            y: globalRegion.y,
            width: globalRegion.w,
            height: globalRegion.h
        },
        region_modes_mag: region_modes_mag,
        region_modes_phase: region_modes_phase
    };

    try {
        const response = await fetch('/process_ft', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('outputImg1').src = `data:image/png;base64,${data.image_data}`;
        }
    } catch (error) {
        console.error('Mixing error:', error);
    }
}