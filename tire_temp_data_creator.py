import pandas as pd
import numpy as np
from tkinter import Tk, filedialog

# Let user select file
root = Tk()
root.withdraw()
file_path = filedialog.askopenfilename(filetypes=[("CSV files", "*.csv")])

df = pd.read_csv(file_path)

# Define tires and zones
tires = ["fl", "fr", "rl", "rr"]
zones = ["inner", "middle", "outer"]

# Base cold profile (around ambient)
base_profile = {
    "inner": 26,
    "middle": 25,
    "outer": 24
}

def generate_tire_temps(time_sec, variation=2):
    temps = {}
    heatup = min(1.0, time_sec / 300.0)  # warm up over 5 minutes
    for tire in tires:
        for zone in zones:
            base = base_profile[zone]
            heat_gain = heatup * np.random.uniform(15, 30)  # up to ~30°C gain
            wave = np.sin(time_sec / 20 + hash(tire + zone) % 10) * 0.8
            noise = np.random.normal(0, 0.5)
            temp = base + heat_gain + wave + noise
            temps[f"{tire}_{zone}"] = round(temp, 2)
    return temps

# Figure out which column is time
time_col = next((col for col in df.columns if "time" in col.lower()), None)
if not time_col:
    raise ValueError("Could not find a time column in the CSV.")

# Apply to each row
new_data = df.copy()
for idx, row in new_data.iterrows():
    t = float(row[time_col])
    temps = generate_tire_temps(t)
    for key, value in temps.items():
        new_data.at[idx, key] = value

# Save the updated CSV
new_data.to_csv("all_sensors.csv", index=False)
print("CSV updated with tire temps in Celsius.")
