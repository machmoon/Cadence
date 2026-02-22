print("script started")
import cv2
import mediapipe as mp
import numpy as np
import urllib.request
import os
import mido

# --- MIDI SETUP ---
midi_out = mido.open_output("GestureHand MIDI", virtual=True)

FINGER_CC = {
    "thumb": 20,
    "index": 21,
    "middle": 22,
    "ring": 23,
    "pinky": 24,
}

def enhance_red_gloves(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Red color ranges (two ranges because HSV wraps)
    lower_red1 = np.array([0, 120, 70])
    upper_red1 = np.array([10, 255, 255])

    lower_red2 = np.array([170, 120, 70])
    upper_red2 = np.array([180, 255, 255])

    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)

    mask = mask1 | mask2

    # Clean up mask
    mask = cv2.GaussianBlur(mask, (5, 5), 0)

    # Apply mask to highlight red regions
    enhanced = cv2.bitwise_and(frame, frame, mask=mask)

    # Blend with original (keeps structure)
    combined = cv2.addWeighted(frame, 0.7, enhanced, 0.6, 0)

    return combined, mask

last_cc_values = {f: -1 for f in FINGER_CC}

# --- FINGER BEND DETECTION ---
def estimate_bend(landmarks, mcp, pip, dip, tip):
    a = np.array([landmarks[mcp].x, landmarks[mcp].y])
    b = np.array([landmarks[pip].x, landmarks[pip].y])
    c = np.array([landmarks[dip].x, landmarks[dip].y])
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    angle = np.degrees(np.arccos(np.clip(cosine, -1, 1)))
    return 1 - (angle / 180)

def get_finger_bends(landmarks):
    return {
        "thumb":  estimate_bend(landmarks, 1,  2,  3,  4),
        "index":  estimate_bend(landmarks, 5,  6,  7,  8),
        "middle": estimate_bend(landmarks, 9,  10, 11, 12),
        "ring":   estimate_bend(landmarks, 13, 14, 15, 16),
        "pinky":  estimate_bend(landmarks, 17, 18, 19, 20),
    }

# --- MEDIAPIPE SETUP ---
if not os.path.exists("hand_landmarker.task"):
    print("Downloading model...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        "hand_landmarker.task"
    )
    print("Model downloaded!")

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path="hand_landmarker.task"),
    running_mode=VisionRunningMode.IMAGE,
    num_hands=1
)

cap = cv2.VideoCapture(0)
print("Camera opened — MIDI controller active!")

with HandLandmarker.create_from_options(options) as landmarker:
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)

        if result.hand_landmarks:
            for hand_landmarks in result.hand_landmarks:
                h, w, _ = frame.shape

                # Draw landmarks
                for lm in hand_landmarks:
                    cx, cy = int(lm.x * w), int(lm.y * h)
                    cv2.circle(frame, (cx, cy), 5, (0, 255, 0), -1)

                bends = get_finger_bends(hand_landmarks)

                # --- SEND MIDI CC ---
                for finger, bend in bends.items():
                    cc_val = int(np.clip(bend * 127, 0, 127))
                    cc_num = FINGER_CC[finger]

                    if abs(cc_val - last_cc_values[finger]) > 1:
                        msg = mido.Message('control_change', control=cc_num, value=cc_val)
                        midi_out.send(msg)
                        last_cc_values[finger] = cc_val

                # --- DISPLAY ---
                y = 30
                for fname, bend in bends.items():
                    cc_val = int(bend * 127)
                    text = f"{fname}: {bend:.2f} ({cc_val})"
                    cv2.putText(frame, text, (10, y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                    y += 25

        else:
            cv2.putText(frame, "No hand detected", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        cv2.imshow("Gesture MIDI Controller", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()