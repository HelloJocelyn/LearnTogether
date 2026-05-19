import numpy as np

# 5×5 原始矩阵
image = np.array([
    [0,   0,   0,   0,   0],
    [0,   0,   0,   0,   0],
    [0,   0, 255,   0,   0],
    [0,   0,   0,   0,   0],
    [0,   0,   0,   0,   0],
], dtype=np.float64)

# 3×3 高斯核
kernel = np.array([
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1]
]) / 16

# 卷积函数
def convolve(image, kernel):
    H, W = image.shape
    out = np.zeros_like(image)
    for y in range(1, H-1):
        for x in range(1, W-1):
            region = image[y-1:y+2, x-1:x+2]
            out[y, x] = np.sum(region * kernel)
    return out

result = convolve(image, kernel)

print("Original Matrix :")
print(image.astype(int))

print("\nGaussian Blur :")

print(np.round(result).astype(int))