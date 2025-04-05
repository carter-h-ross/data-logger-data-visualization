import pandas as pd
import numpy as np
from tkinter import Tk, filedialog

# File picker
root = Tk()
root.withdraw()
file_path = filedialog.askopenfilename(filetypes=[("CSV files", "*.csv")])
df = pd.read_csv(file_path)

# Tire zones
tires = ["fl", "fr", "rl", "rr"]
zones = ["inner", "middle", "outer"]
base_profile = {"inner": 26, "middle": 25, "outer": 24}
prev_temps = {f"{t}_{z}": base_profile[z] for t in tires for z in zones}

# Get time column
time_col = next((col for col in df.columns if "time" in col.lower()), None)
if not time_col:
    raise ValueError("No time column found in the CSV.")

def simulate_lap_conditions(t):
    # Simulate lap phases using wave-like behavior
    speed = 60 + 40 * np.sin(t / 4)  # Speed oscillates between 20–100 mph
    accel = np.gradient([60 + 40 * np.sin((t - 0.1) / 4), speed])[1]  # numerical derivative
    raw_throttle = np.clip(50 + accel * 15 + np.random.normal(0, 1), 0, 100)
    raw_brake_front = np.clip(-accel * 25 + np.random.normal(0, 1), 0, 100)

    # Enforce mutual exclusivity
    if raw_brake_front > 1:
        throttle = 0
        brake_front = raw_brake_front
    elif raw_throttle > 1:
        throttle = raw_throttle
        brake_front = 0
    else:
        throttle = 0
        brake_front = 0

    brake_rear = brake_front * 0.6 + np.random.normal(0, 1)

    return round(speed, 1), round(throttle, 1), round(brake_front, 2), round(brake_rear, 2)


def generate_tire_temps(t, speed, brake_force, alpha=0.03):
    global prev_temps
    temps = {}
    heatup = min(1.0, t / 300.0)

    for tire in tires:
        for zone in zones:
            base = base_profile[zone]
            speed_effect = 0.05 * speed
            brake_effect = 0.2 * brake_force  # Braking increases temp
            target = base + heatup * 10 + speed_effect + brake_effect
            prev = prev_temps[f"{tire}_{zone}"]
            smooth_temp = (1 - alpha) * prev + alpha * target + np.random.normal(0, 0.2)
            temps[f"{tire}_{zone}"] = round(smooth_temp, 2)
            prev_temps[f"{tire}_{zone}"] = smooth_temp

    return temps

# Simulate data
new_data = df.copy()
for idx, row in new_data.iterrows():
    t = float(row[time_col])
    
    speed, throttle, brake_f, brake_r = simulate_lap_conditions(t)
    temps = generate_tire_temps(t, speed, brake_f)

    for k, v in temps.items():
        new_data.at[idx, k] = v

    new_data.at[idx, "speed_mph"] = speed
    new_data.at[idx, "throttle_position"] = throttle
    new_data.at[idx, "brake_pressure_front"] = brake_f
    new_data.at[idx, "brake_pressure_rear"] = brake_r

# Save to file
new_data.to_csv("all_sensors.csv", index=False)
print("CSV updated with realistic, correlated sensor data.")
