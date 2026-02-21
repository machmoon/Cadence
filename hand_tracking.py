print("script started")
import cv2
import mediapipe as mp
import numpy as np
import pygame
import urllib.request
import os

# --- SOUND SETUP ---
pygame.mixer.init(frequency=44100, size=-16, channels=1, buffer=512)

def generate_tone(frequency, duration=0.3, volume=0.5):
    sample_rate = 44100
    samples = int(sample_rate * duration)
    t = np.linspace(0, duration, samples, False)
    wave = (np.sin(2 * np.pi * frequency * t) * volume * 32767).astype(np.int16)
    return pygame.sndarray.make_sound(wave)

NOTES = {
    "C":  generate_tone(261.63),
    "D":  generate_tone(293.66),
    "E":  generate_tone(329.63),
    "F":  generate_tone(349.23),
    "G":  generate_tone(392.00),
    "A":  generate_tone(440.00),
    "B":  generate_tone(493.88),
    "C2": generate_tone(523.25),
    "D2": generate_tone(587.33),
    "E2": generate_tone(659.25),
    "F2": generate_tone(698.46),
    "G2": generate_tone(783.99),
    "A2": generate_tone(880.00),
    "B2": generate_tone(987.77),
    "C3": generate_tone(1046.50),
}

# --- FINGER CURL DETECTION ---
def estimate_bend(landmarks, mcp, pip, dip, tip):
    a = np.array([landmarks[mcp].x, landmarks[mcp].y])
    b = np.array([landmarks[pip].x, landmarks[pip].y])
    c = np.array([landmarks[dip].x, landmarks[dip].y])
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    angle = np.degrees(np.arccos(np.clip(cosine, -1, 1)))
    return 1 - (angle / 180)  # 0 = straight, 1 = fully curled

def get_finger_states(landmarks, threshold=0.5):
    return {
        "thumb":  estimate_bend(landmarks, 1,  2,  3,  4)  < threshold,
        "index":  estimate_bend(landmarks, 5,  6,  7,  8)  < threshold,
        "middle": estimate_bend(landmarks, 9,  10, 11, 12) < threshold,
        "ring":   estimate_bend(landmarks, 13, 14, 15, 16) < threshold,
        "pinky":  estimate_bend(landmarks, 17, 18, 19, 20) < threshold,
    }

# --- GESTURE TO NOTE MAPPING ---
def get_note(fingers):
    i = fingers["index"]
    m = fingers["middle"]
    r = fingers["ring"]
    p = fingers["pinky"]

    # --- SINGLE FINGER UP ---
    if i and not m and not r and not p:      return "C"
    if not i and m and not r and not p:      return "D"
    if not i and not m and r and not p:      return "E"
    if not i and not m and not r and p:      return "F"

    # --- SINGLE FINGER DOWN (three up) ---
    if not i and m and r and p:              return "G"
    if i and not m and r and p:              return "A"
    if i and m and not r and p:              return "B"
    if i and m and r and not p:              return "C2"

    # --- TWO ADJACENT FINGERS UP ---
    if i and m and not r and not p:          return "D2"
    if not i and m and r and not p:          return "E2"
    if not i and not m and r and p:          return "F2"

    # --- TWO NON-ADJACENT FINGERS UP ---
    if i and not m and r and not p:          return "G2"
    if i and not m and not r and p:          return "A2"
    if not i and m and not r and p:          return "B2"

    # --- ALL FOUR UP ---
    if i and m and r and p:                  return "C3"

    return None

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
print("Camera opened — show your hand!")

last_note = None
note_buffer = []
BUFFER_SIZE = 5

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

                # Get finger states
                fingers = get_finger_states(hand_landmarks)
                current_note = get_note(fingers)

                # Stability buffer
                note_buffer.append(current_note)
                if len(note_buffer) > BUFFER_SIZE:
                    note_buffer.pop(0)

                stable_note = current_note if note_buffer.count(current_note) == BUFFER_SIZE else None

                # Play note if changed
                if stable_note and stable_note != last_note:
                    NOTES[stable_note].play()
                    print(f"Playing: {stable_note} | Fingers: {[f for f,u in fingers.items() if u]}")
                    last_note = stable_note

                # Display finger states on screen
                y = 30
                for fname, is_up in fingers.items():
                    if fname == "thumb":
                        continue
                    status = "UP" if is_up else "down"
                    color = (0, 255, 0) if is_up else (0, 0, 255)
                    cv2.putText(frame, f"{fname}: {status}", (10, y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                    y += 25

                # Display current note
                if stable_note:
                    cv2.putText(frame, f"NOTE: {stable_note}", (10, y + 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 0), 3)
                elif current_note:
                    cv2.putText(frame, f"(holding...)", (10, y + 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 0), 2)

        else:
            note_buffer.clear()
            last_note = None
            cv2.putText(frame, "No hand detected", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        cv2.imshow("GesturePlay", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()