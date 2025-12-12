// --- Global State ---
let globalRegion = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }; 
let isDrawing = false;
let activeCanvasId = null;
let startX, startY;
const canvases = {}; 
const contexts = {};
const ftImages = {}; 

// B/C State
let isDraggingBC = false;
let activeSlotBC = -1;
let lastMouseX = 0, lastMouseY = 0;
let bcValues = [
    {b:0, c:1}, {b:0, c:1}, {b:0, c:1}, {b:0, c:1}
];

// PORT STATE MANAGEMENT
// We keep two full copies of the UI state (sliders, weights, modes)
// so switching ports restores that port's settings.
const portState = {
    1: createDefaultState(),
    2: createDefaultState()
};
let activePort = 1;

function createDefaultState() {
    return {
        // 4 images, 2 sliders each = 8 values
        sliders1: [0,0,0,0], 
        sliders2: [0,0,0,0],
        // 4 images, 2 radio sets each
        radios1: ['inner','inner','inner','inner'],
        radios2: ['inner','inner','inner','inner'],
        mode: 'magnitude_phase' 
    };
}

window.onload = function() {
    for (let i = 1; i <= 4; i++) {
        setupCanvas(i);
    }
    // Initialize UI listeners for Mode change
    // But don't trigger mix yet, wait for setup
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    
    // Initial UI Setup
    updateUIForMode(); 
};

// --- Port Switching Logic ---
function switchOutputPort() {
    // 1. Save current UI state to the OLD active port
    saveState(activePort);
    
    // 2. Switch active ID
    activePort = parseInt(document.getElementById('targetOutput').value);
    
    // 3. Load NEW state to UI
    loadState(activePort);
    
    // 4. Update UI labels (Mode might have changed)
    updateUIForMode(false); // false = don't double trigger mix
    
    // 5. Highlight active output card
    document.getElementById('outCard1').style.border = activePort === 1 ? '2px solid #4fa08b' : 'none';
    document.getElementById('outCard2').style.border = activePort === 2 ? '2px solid #4fa08b' : 'none';
    
    // 6. Trigger mix to refresh view if needed (or just ensure image is current)
    // Actually, we usually want to see what is stored.
    updateMix();
}

function saveState(portId) {
    const s = portState[portId];
    s.mode = document.getElementById('mixMode').value;
    for(let i=0; i<4; i++) {
        const id = i+1;
        s.sliders1[i] = document.getElementById(`slider1_img${id}`).value;
        s.sliders2[i] = document.getElementById(`slider2_img${id}`).value;
        s.radios1[i] = document.querySelector(`input[name="r1_img${id}"]:checked`).value;
        s.radios2[i] = document.querySelector(`input[name="r2_img${id}"]:checked`).value;
    }
}

function loadState(portId) {
    const s = portState[portId];
    document.getElementById('mixMode').value = s.mode;
    for(let i=0; i<4; i++) {
        const id = i+1;
        document.getElementById(`slider1_img${id}`).value = s.sliders1[i];
        document.getElementById(`slider2_img${id}`).value = s.sliders2[i];
        
        // Radios
        const r1s = document.getElementsByName(`r1_img${id}`);
        for(let r of r1s) r.checked = (r.value === s.radios1[i]);
        
        const r2s = document.getElementsByName(`r2_img${id}`);
        for(let r of r2s) r.checked = (r.value === s.radios2[i]);
    }
}

// --- UI Mode Management ---
function updateUIForMode(triggerMix = true) {
    const mode = document.getElementById('mixMode').value;
    const isMagPhase = (mode === 'magnitude_phase');
    
    const label1 = isMagPhase ? "Magnitude" : "Real";
    const label2 = isMagPhase ? "Phase" : "Imaginary";
    
    const opts = isMagPhase 
        ? `<option value="magnitude">Magnitude</option><option value="phase">Phase</option>`
        : `<option value="real">Real</option><option value="imaginary">Imaginary</option>`;

    for(let i=1; i<=4; i++) {
        document.querySelector(`#card${i} .comp1-label`).innerText = label1;
        document.querySelector(`#card${i} .comp2-label`).innerText = label2;
        
        const select = document.getElementById(`ftSelect${i}`);
        // Save old selection index if possible, else reset
        const oldIdx = select.selectedIndex;
        select.innerHTML = opts;
        select.selectedIndex = (oldIdx >= 0 && oldIdx < select.options.length) ? oldIdx : 0;
        
        updateFTDisplay(i);
    }
    if(triggerMix) updateMix();
}

// --- Canvas Drawing ---
function setupCanvas(id) {
    const canvas = document.getElementById(`ftCanvas${id}`);
    const ctx = canvas.getContext('2d');
    canvases[id] = canvas;
    contexts[id] = ctx;
    ftImages[id] = new Image();
    canvas.addEventListener('mousedown', (e) => startDrawing(e, id));
}

function startDrawing(e, id) {
    isDrawing = true;
    activeCanvasId = id;
    const rect = canvases[id].getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
}

function handleGlobalMouseMove(e) {
    if (isDrawing && activeCanvasId) {
        const canvas = canvases[activeCanvasId];
        if(!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        let w = (e.clientX - rect.left) - startX;
        let h = (e.clientY - rect.top) - startY;
        let x = startX;
        let y = startY;

        if (w < 0) { x += w; w = Math.abs(w); }
        if (h < 0) { y += h; h = Math.abs(h); }

        globalRegion = {
            x: x / canvas.width,
            y: y / canvas.height,
            w: w / canvas.width,
            h: h / canvas.height
        };
        redrawAllCanvases();
    } else if (isDraggingBC) {
        handleBCDrag(e);
    }
}

function handleGlobalMouseUp() {
    if (isDrawing) { isDrawing = false; activeCanvasId = null; updateMix(); }
    if (isDraggingBC) { isDraggingBC = false; sendBCUpdate(activeSlotBC); }
}

function redrawAllCanvases() {
    for (let i = 1; i <= 4; i++) {
        const ctx = contexts[i];
        const canvas = canvases[i];
        const img = ftImages[i];
        ctx.clearRect(0,0, canvas.width, canvas.height);
        if (img.src) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const rx = globalRegion.x * canvas.width;
        const ry = globalRegion.y * canvas.height;
        const rw = globalRegion.w * canvas.width;
        const rh = globalRegion.h * canvas.height;

        ctx.strokeStyle = '#4fa08b';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(rx, ry, rw, rh);
    }
}

// --- Brightness/Contrast ---
function startBCDrag(e, id) {
    if (e.button === 0) {
        isDraggingBC = true; activeSlotBC = id;
        lastMouseX = e.clientX; lastMouseY = e.clientY;
        e.preventDefault();
    }
}

function handleBCDrag(e) {
    if (!isDraggingBC) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    
    bcValues[activeSlotBC-1].b += dx * 0.01;
    bcValues[activeSlotBC-1].c -= dy * 0.01;
    bcValues[activeSlotBC-1].b = Math.max(-1, Math.min(1, bcValues[activeSlotBC-1].b));
    bcValues[activeSlotBC-1].c = Math.max(0.1, Math.min(3, bcValues[activeSlotBC-1].c));
    
    const label = document.getElementById(`bcLabel${activeSlotBC}`);
    label.style.display = 'block';
    label.innerText = `B:${bcValues[activeSlotBC-1].b.toFixed(2)} C:${bcValues[activeSlotBC-1].c.toFixed(2)}`;
}

async function sendBCUpdate(id) {
    await fetch('/adjust_bc', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            slot_id: id,
            brightness: bcValues[id-1].b,
            contrast: bcValues[id-1].c
        })
    });
    refreshImage(id);
}

function refreshImage(id) {
    fetch(`/component/${id}/image`)
        .then(r => r.json())
        .then(d => { document.getElementById(`img${id}`).src = `data:image/png;base64,${d.image_data}`; });
    updateFTDisplay(id);
}

// --- Upload & Mix ---
async function uploadImage(id) {
    const file = document.getElementById(`file${id}`).files[0];
    if(!file) return;
    const fd = new FormData(); fd.append('file', file);
    await fetch(`/upload/${id}`, { method: 'POST', body: fd });
    refreshImage(id);
    updateMix();
}

async function updateFTDisplay(id) {
    const type = document.getElementById(`ftSelect${id}`).value;
    try {
        const r = await fetch(`/component/${id}/${type}`);
        const d = await r.json();
        ftImages[id].onload = () => redrawAllCanvases();
        ftImages[id].src = `data:image/png;base64,${d.image_data}`;
    } catch(e) {}
}

async function updateMix() {
    // Collect Data
    const w1 = [], w2 = [];
    const r1 = [], r2 = [];
    
    for(let i=1; i<=4; i++) {
        w1.push(document.getElementById(`slider1_img${i}`).value / 100.0);
        w2.push(document.getElementById(`slider2_img${i}`).value / 100.0);
        r1.push(document.querySelector(`input[name="r1_img${i}"]:checked`).value);
        r2.push(document.querySelector(`input[name="r2_img${i}"]:checked`).value);
    }
    
    // Also save this data to our state cache for the current port
    saveState(activePort);
    
    const payload = {
        mode: document.getElementById('mixMode').value,
        weights_1: w1, weights_2: w2,
        region_settings_1: r1, region_settings_2: r2,
        region_enabled: true,
        region: { x: globalRegion.x, y: globalRegion.y, width: globalRegion.w, height: globalRegion.h }
    };
    
    const r = await fetch('/process_ft', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    const d = await r.json();
    
    // Update ONLY the active port's image
    document.getElementById(`outputImg${activePort}`).src = `data:image/png;base64,${d.image_data}`;
}