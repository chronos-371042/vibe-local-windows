#!/usr/bin/env python3
"""vibe-pet desktop: a tiny always-on-top pet that visualizes Claude Code state.

Claude Code hooks (see state-hook.js) write ~/.claude/pet/state.json;
this app polls that file and switches animations. It never talks to
Claude Code directly, so either side can run without the other.

Controls:  drag = move (position is remembered) / right-click = hide / quit
Sprites:   pixel-art drawn in code; drop PNGs into ~/.claude/pet/sprites/
           named <state>_<frame>.png (e.g. working_0.png) to replace them.

Requires Python 3 with tkinter (bundled on Windows/macOS python.org builds;
`apt install python3-tk` on Debian/Ubuntu).
"""

import json
import os
import sys
import time
import tkinter as tk

PET_DIR = os.path.join(os.path.expanduser("~"), ".claude", "pet")
STATE_FILE = os.path.join(PET_DIR, "state.json")
UI_FILE = os.path.join(PET_DIR, "ui.json")
SPRITE_DIR = os.path.join(PET_DIR, "sprites")

SCALE = 7  # pixels per sprite pixel
FRAME_MS = 350  # animation speed
POLL_MS = 200  # state.json poll interval
DONE_REVERT_S = 8  # done -> idle after this many seconds
ERROR_REVERT_S = 20  # error -> idle after this many seconds
STALE_S = 15 * 60  # no hook updates for this long -> idle
MAGIC = "#012001"  # transparency key color (Windows); unlikely real color

PALETTE = {
    "o": "#d17b55",  # terracotta body
    "e": "#3b251d",  # eyes
    "y": "#ffd75a",  # highlight / "!"
    "b": "#6eaae6",  # sweat drop
    "w": "#ffffff",  # flash
    "r": "#e25555",  # error
}

# ----------------------------------------------------------------- sprites

GRID_W, GRID_H = 12, 10


def creature(eyes="open"):
    e = "e" if eyes == "open" else "o"
    return [
        "..o......o..",
        ".oooooooooo.",
        "oo" + e + "oooooo" + e + "oo",
        "oooooooooooo",
        "..o..oo..o..",
    ]


def frame(body, top):
    """Place the 5-row creature in a GRID_W x GRID_H canvas, top rows down."""
    blank = "." * GRID_W
    rows = [blank] * top + body
    rows += [blank] * (GRID_H - len(rows))
    return rows


def overlay(rows, pixels):
    grid = [list(r) for r in rows]
    for (y, x), ch in pixels.items():
        grid[y][x] = ch
    return ["".join(r) for r in grid]


def shift(rows, dx):
    if dx > 0:
        return ["." * dx + r[:-dx] for r in rows]
    if dx < 0:
        return [r[-dx:] + "." * -dx for r in rows]
    return rows


def mark(pixels, color):
    return {pos: color for pos in pixels}


QUESTION = [(0, 7), (0, 8), (0, 9), (1, 9), (2, 8), (3, 8)]  # "?" above right
CROSS = [(0, 5), (0, 7), (1, 6), (2, 5), (2, 7)]  # "x" above head

FRAMES = {
    "idle": [
        frame(creature(), 4),
        frame(creature("closed"), 5),  # blink + bob
    ],
    "working": [
        overlay(frame(creature(), 4), {(3, 10): "b"}),  # sweat drop falls
        overlay(frame(creature(), 5), {(4, 11): "b"}),
    ],
    "waiting_input": [  # shake left/right with a flashing "?"
        overlay(frame(shift(creature(), -1), 4), mark(QUESTION, "y")),
        overlay(frame(shift(creature(), 1), 4), mark(QUESTION, "w")),
        overlay(frame(shift(creature(), -1), 4), mark(QUESTION, "w")),
        overlay(frame(shift(creature(), 1), 4), mark(QUESTION, "y")),
    ],
    "done": [  # crouch, jump with "!", sparkle, land
        frame(creature("closed"), 5),
        overlay(frame(creature(), 2), {(0, 5): "y", (0, 6): "y", (1, 5): "y", (1, 6): "y"}),
        overlay(frame(creature(), 3), {(1, 1): "y", (0, 10): "y", (2, 11): "y"}),
        frame(creature(), 4),
    ],
    "error": [  # trembling with a red flashing "x"
        overlay(frame(shift(creature(), -1), 4), mark(CROSS, "r")),
        overlay(frame(shift(creature(), 1), 4), mark(CROSS, "w")),
    ],
}

STATES = set(FRAMES)

# attention states animate faster so they pop
FRAME_MS_BY_STATE = {"waiting_input": 180, "done": 250, "error": 180}


def load_png_frames(state):
    """Optional PNG override: ~/.claude/pet/sprites/<state>_<n>.png"""
    frames, n = [], 0
    while True:
        f = os.path.join(SPRITE_DIR, "%s_%d.png" % (state, n))
        if not os.path.exists(f):
            break
        frames.append(tk.PhotoImage(file=f))
        n += 1
    return frames


# ------------------------------------------------------------------- app


class Pet:
    def __init__(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True)  # frameless
        self.root.attributes("-topmost", True)
        self.setup_transparency()

        w, h = GRID_W * SCALE, GRID_H * SCALE
        self.canvas = tk.Canvas(
            self.root, width=w, height=h, bg=self.bg, highlightthickness=0
        )
        self.canvas.pack()

        self.state = "idle"
        self.tick = 0
        self.state_mtime = 0.0
        self.state_since = time.time()
        self.png_frames = {s: load_png_frames(s) for s in STATES}

        self.place_window(w, h)
        self.bind_controls()
        self.root.after(0, self.animate)
        self.root.after(POLL_MS, self.poll_state)

    # -- window -----------------------------------------------------------

    def setup_transparency(self):
        self.bg = MAGIC
        try:
            if sys.platform == "win32":
                self.root.attributes("-transparentcolor", MAGIC)
            elif sys.platform == "darwin":
                self.root.attributes("-transparent", True)
            else:  # X11: no color-key transparency; neutral dark + alpha
                self.bg = "#1f1f1f"
                self.root.attributes("-alpha", 0.95)
        except tk.TclError:
            self.bg = "#1f1f1f"  # solid background is an acceptable fallback
        self.root.configure(bg=self.bg)

    def place_window(self, w, h):
        try:
            with open(UI_FILE, encoding="utf-8") as f:
                pos = json.load(f)
            x, y = int(pos["x"]), int(pos["y"])
        except Exception:
            x = self.root.winfo_screenwidth() - w - 60  # default: bottom right
            y = self.root.winfo_screenheight() - h - 80
        self.root.geometry("+%d+%d" % (max(x, 0), max(y, 0)))

    def save_position(self):
        try:
            os.makedirs(PET_DIR, exist_ok=True)
            with open(UI_FILE, "w", encoding="utf-8") as f:
                json.dump({"x": self.root.winfo_x(), "y": self.root.winfo_y()}, f)
        except OSError:
            pass

    # -- controls ---------------------------------------------------------

    def bind_controls(self):
        self.canvas.bind("<Button-1>", self.drag_start)
        self.canvas.bind("<B1-Motion>", self.drag_move)
        self.canvas.bind("<ButtonRelease-1>", lambda e: self.save_position())

        menu = tk.Menu(self.root, tearoff=0)
        menu.add_command(label="隠す (30分)", command=self.hide_for_a_while)
        menu.add_separator()
        menu.add_command(label="終了", command=self.quit)
        for seq in ("<Button-3>", "<Control-Button-1>"):  # right click / mac
            self.canvas.bind(seq, lambda e, m=menu: m.tk_popup(e.x_root, e.y_root))

    def drag_start(self, e):
        self._drag = (e.x, e.y)

    def drag_move(self, e):
        x = self.root.winfo_x() + e.x - self._drag[0]
        y = self.root.winfo_y() + e.y - self._drag[1]
        self.root.geometry("+%d+%d" % (x, y))

    def hide_for_a_while(self):
        self.root.withdraw()
        self.root.after(30 * 60 * 1000, self.root.deiconify)

    def quit(self):
        self.save_position()
        self.root.destroy()

    # -- state ------------------------------------------------------------

    def poll_state(self):
        try:
            mtime = os.path.getmtime(STATE_FILE)
            if mtime != self.state_mtime:
                self.state_mtime = mtime
                with open(STATE_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                self.set_state(data.get("state", "idle"))
            elif time.time() - mtime > STALE_S:
                self.set_state("idle")  # hooks went quiet; assume nothing runs
        except (OSError, ValueError):
            pass  # missing/partial file: keep current state
        if self.state == "done" and time.time() - self.state_since > DONE_REVERT_S:
            self.set_state("idle")
        elif self.state == "error" and time.time() - self.state_since > ERROR_REVERT_S:
            self.set_state("idle")
        self.root.after(POLL_MS, self.poll_state)

    def set_state(self, state):
        if state not in STATES:
            state = "idle"
        if state != self.state:
            self.state = state
            self.state_since = time.time()
            self.tick = 0

    # -- drawing ----------------------------------------------------------

    def animate(self):
        self.canvas.delete("all")
        pngs = self.png_frames.get(self.state)
        if pngs:
            self.canvas.create_image(0, 0, anchor="nw", image=pngs[self.tick % len(pngs)])
        else:
            frames = FRAMES[self.state]
            self.draw_grid(frames[self.tick % len(frames)])
        self.tick += 1
        self.root.after(FRAME_MS_BY_STATE.get(self.state, FRAME_MS), self.animate)

    def draw_grid(self, rows):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                color = PALETTE.get(ch)
                if not color:
                    continue
                self.canvas.create_rectangle(
                    x * SCALE, y * SCALE, (x + 1) * SCALE, (y + 1) * SCALE,
                    fill=color, outline=color,
                )


if __name__ == "__main__":
    Pet().root.mainloop()
