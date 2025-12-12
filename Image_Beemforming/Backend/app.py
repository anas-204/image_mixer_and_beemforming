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
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'error': 'Empty'}), 400

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], f'image_{slot_id}.png')
    file.save(filepath)
    mixer.update_image(slot_id - 1, filepath)
    return jsonify({'filepath': filepath})

@app.route('/component/<int:slot_id>/<type>', methods=['GET'])
def get_component(slot_id, type):
    idx = slot_id - 1
    if idx < 0 or idx >= 4: return "Error", 400
    
    img_processor = mixer.images[idx]
    
    if type == 'image':
        result_img = img_processor.get_image_display()
    else:
        result_img = img_processor.get_component_display(type)
    
    if result_img is None:
        result_img = np.zeros((200, 200), dtype=np.uint8)

    _, buffer = cv2.imencode('.png', result_img)
    return jsonify({'image_data': base64.b64encode(buffer).decode('utf-8')})

@app.route('/adjust_bc', methods=['POST'])
def adjust_bc():
    data = request.json
    slot_id = int(data['slot_id'])
    b = float(data['brightness'])
    c = float(data['contrast'])
    mixer.adjust_image_bc(slot_id - 1, b, c)
    return jsonify({'status': 'ok'})

@app.route('/process_ft', methods=['POST'])
def process_ft():
    data = request.json
    
    mode = data.get('mode', 'magnitude_phase')
    
    # Gather granular data
    # We expect weights_1 and weights_2 to be lists of 4 floats
    # region_settings_1 and region_settings_2 to be lists of 4 strings
    
    w1 = [float(x) for x in data['weights_1']]
    w2 = [float(x) for x in data['weights_2']]
    r1 = data['region_settings_1']
    r2 = data['region_settings_2']
    
    global_region = None
    if data.get('region_enabled', False):
        global_region = {
            'x': float(data['region']['x']),
            'y': float(data['region']['y']),
            'w': float(data['region']['width']),
            'h': float(data['region']['height'])
        }

    result_img = mixer.mix(w1, w2, r1, r2, global_region, mode)

    if result_img is None:
        return jsonify({'error': 'No images'}), 400

    _, buffer = cv2.imencode('.png', result_img)
    return jsonify({'image_data': base64.b64encode(buffer).decode('utf-8')})

if __name__ == '__main__':
    app.run(debug=True, port=5000)