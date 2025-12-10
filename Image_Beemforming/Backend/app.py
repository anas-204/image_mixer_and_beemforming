import os
import cv2
import base64
import numpy as np
from flask import Flask, render_template, request, jsonify
from core.ft_mixer import FTMixer

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

mixer = FTMixer()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload/<int:slot_id>', methods=['POST'])
def upload_file(slot_id):
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], f'image_{slot_id}.png')
    file.save(filepath)

    mixer.update_image(slot_id - 1, filepath)
    return jsonify({'filepath': filepath})

# NEW: Endpoint to get FT components
@app.route('/component/<int:slot_id>/<type>', methods=['GET'])
def get_component(slot_id, type):
    """Returns the requested FT component (Mag, Phase, Real, Imag) as base64"""
    # Adjust slot_id (1-based from frontend to 0-based index)
    img_processor = mixer.images[slot_id - 1]
    
    result_img = img_processor.get_component_display(type)
    
    if result_img is None:
        # Return a placeholder black image if not loaded
        placeholder = np.zeros((200, 200), dtype=np.uint8)
        _, buffer = cv2.imencode('.png', placeholder)
        return base64.b64encode(buffer).decode('utf-8')

    _, buffer = cv2.imencode('.png', result_img)
    img_str = base64.b64encode(buffer).decode('utf-8')
    return jsonify({'image_data': img_str})

@app.route('/process_ft', methods=['POST'])
def process_ft():
    data = request.json
    
    w_mag = [float(data['weights_mag'][f'img{i+1}']) for i in range(4)]
    w_phase = [float(data['weights_phase'][f'img{i+1}']) for i in range(4)]
    
    region_info = None
    if data.get('region_enabled', False):
        region_info = {
            'x': int(data['region']['x']),
            'y': int(data['region']['y']),
            'w': int(data['region']['width']),
            'h': int(data['region']['height']),
            # These keys match what main.js sends
            'mag_modes': [data['region_modes_mag'][f'img{i+1}'] for i in range(4)],
            'phase_modes': [data['region_modes_phase'][f'img{i+1}'] for i in range(4)]
        }

    result_img = mixer.mix(w_mag, w_phase, region_info)

    if result_img is None:
        return jsonify({'error': 'No images loaded'}), 400

    _, buffer = cv2.imencode('.png', result_img)
    img_str = base64.b64encode(buffer).decode('utf-8')

    return jsonify({'image_data': img_str})

if __name__ == '__main__':
    app.run(debug=True, port=5000)