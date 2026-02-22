import random

# -----------------------
# 1. MIDI → pitch class helper
# -----------------------
def midi_to_pc(midi_notes):
    """Convert MIDI notes to pitch classes (0-11)."""
    return sorted(set([n % 12 for n in midi_notes]))

# -----------------------
# 2. Chord templates
# -----------------------
CHORD_TEMPLATES = {
    "maj7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "7": [0, 4, 7, 10],
    "maj": [0, 4, 7],
    "min": [0, 3, 7],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "add9": [0, 4, 7, 2],
    "dim": [0, 3, 6],
}

# -----------------------
# 3. Chord detection
# -----------------------
def detect_chord(midi_notes):
    pcs = midi_to_pc(midi_notes)
    for root in pcs:
        intervals = sorted([(p - root) % 12 for p in pcs])
        for name, template in CHORD_TEMPLATES.items():
            if set(template).issubset(intervals):
                return root, name
    # fallback to just root note if nothing matches
    return pcs[0], "maj"

# -----------------------
# 4. Major scale mapping
# -----------------------
MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
DEGREE_MAP = {"I": 0, "ii": 1, "iii": 2, "IV": 3, "V": 4, "vi": 5, "vii": 6}

# -----------------------
# 5. Closed Markov chain (relative)
# -----------------------
MARKOV_RELATIVE_CLOSED = {
    "Imaj7": {"vim7": 0.25, "IVmaj7": 0.25, "iiim7": 0.20, "Vsus2": 0.15, "Iadd9": 0.15},
    "vim7": {"IVmaj7": 0.30, "Imaj7": 0.25, "iiim7": 0.20, "iim7": 0.15, "vim9": 0.10},
    "IVmaj7": {"Imaj7": 0.30, "Vsus2": 0.20, "vim7": 0.20, "iiim7": 0.15, "IVadd9": 0.15},
    "iiim7": {"vim7": 0.30, "IVmaj7": 0.25, "Imaj7": 0.20, "iim7": 0.15, "Vsus2": 0.10},
    "iim7": {"IVmaj7": 0.30, "vim7": 0.25, "Imaj7": 0.20, "Vsus2": 0.15, "iiadd9": 0.10},
    "Vsus2": {"Imaj7": 0.35, "vim7": 0.25, "IVmaj7": 0.20, "Vsus4": 0.10, "Vadd9": 0.10},
    "Iadd9": {"vim7": 0.30, "IVmaj7": 0.25, "Vsus2": 0.25, "iiim7": 0.20},
    "vim9": {"Imaj7": 0.30, "IVmaj7": 0.25, "Vsus2": 0.25, "iiim7": 0.20},
    "IVadd9": {"Imaj7": 0.30, "vim7": 0.25, "Vsus2": 0.25, "iiim7": 0.20},
    "Vsus4": {"Imaj7": 0.35, "vim7": 0.25, "IVmaj7": 0.20, "Vsus2": 0.20},
    "Vadd9": {"Imaj7": 0.35, "vim7": 0.25, "IVmaj7": 0.20, "Vsus2": 0.20},
}

# -----------------------
# 6. Map relative chord → actual chord (given root)
# -----------------------
CHORD_TO_TEMPLATE = {
    "maj7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "7": [0, 4, 7, 10],
    "maj": [0, 4, 7],
    "min": [0, 3, 7],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "add9": [0, 4, 7, 2],
    "dim": [0, 3, 6],
}

def relative_to_midi(key_root, relative_chord):
    """Convert relative chord like 'IVmaj7' to MIDI notes."""
    # Split degree and chord type properly
    degree_str = None
    chord_type = None
    for deg in DEGREE_MAP.keys():
        if relative_chord.startswith(deg):
            degree_str = deg
            chord_type = relative_chord[len(deg):]
            break
    if degree_str is None:
        # fallback to I
        degree_str = "I"
        chord_type = "maj"
    
    # Map short names to full template names
    if chord_type == "m7":
        chord_type = "min7"
    elif chord_type == "m":
        chord_type = "min"
    elif chord_type == "":
        chord_type = "maj"

    degree_index = DEGREE_MAP[degree_str]
    root_pc = (key_root + MAJOR_SCALE[degree_index])
    template = CHORD_TO_TEMPLATE.get(chord_type, [0, 4, 7])  # default maj triad
    return [(root_pc + interval) for interval in template]

# -----------------------
# 7. Markov chain sampler
# -----------------------
def next_relative_chord(current, last=None):
    choices = MARKOV_RELATIVE_CLOSED.get(current, {})
    if not choices:
        return random.choice(list(MARKOV_RELATIVE_CLOSED.keys()))
    
    # Remove the last chord if present
    if last in choices:
        del choices[last]
    
    chords = list(choices.keys())
    probs = list(choices.values())
    return random.choices(chords, weights=probs)[0]

# -----------------------
# 8. Full pipeline
# -----------------------
def generate_next_chord_midi(current_midi_notes, key_root_pc):
    # Step 1: detect chord
    root, chord_type = detect_chord(current_midi_notes)
    
    # Step 2: convert to relative chord degree
    # Match root to key_root
    semitone_diff = (root - key_root_pc) % 12
    degree_index = MAJOR_SCALE.index(semitone_diff) if semitone_diff in MAJOR_SCALE else 0
    degree_name = list(DEGREE_MAP.keys())[list(DEGREE_MAP.values()).index(degree_index)]
    relative_chord = degree_name + chord_type
    
    # Step 3: choose next chord
    next_rel_chord = next_relative_chord(relative_chord)
    
    # Step 4: convert back to MIDI notes
    next_chord_midi = relative_to_midi(key_root_pc, next_rel_chord)
    
    return next_chord_midi, next_rel_chord

# -----------------------
# Example usage
# -----------------------
if __name__ == "__main__":
    # Input MIDI notes (Cmaj7)
    current_midi = [60, 64, 67, 71, 74]  # C E G B
    key_root = 60  # C

    next_midi, next_chord = generate_next_chord_midi(current_midi, key_root)
    
    while True:
        print(next_chord, next_midi)
        next_midi, next_chord = generate_next_chord_midi(next_midi, key_root)