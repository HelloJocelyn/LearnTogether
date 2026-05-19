import numpy as np
import matplotlib.pyplot as plt

# 构造一个更有意思的信号
# 两个正弦波叠加：频率1 + 频率5
t = np.linspace(0, 1, 256)
signal = np.sin(2 * np.pi * 3 * t) + 0.5 * np.sin(2 * np.pi * 7 * t)

# 做傅里叶变换
F = np.fft.fft(signal)
freqs = np.fft.fftfreq(len(t), t[1] - t[0])

# 只看正频率部分
half = len(freqs) // 2

fig, axes = plt.subplots(2, 1, figsize=(10, 6))

axes[0].plot(t, signal)
axes[0].set_title("Time Domain : Orignal Signals")
axes[0].set_xlabel("Time")

axes[1].plot(freqs[:half], np.abs(F[:half]))
axes[1].set_title("Frequency Domain : Frequency Components")
axes[1].set_xlabel("Frequency")

plt.tight_layout()
plt.show()