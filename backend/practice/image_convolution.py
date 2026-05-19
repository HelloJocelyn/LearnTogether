import numpy as np
from PIL import Image
import matplotlib.pyplot as plt

# 读取图片，转成灰度
img = Image.open("/Users/jiajia.hu/Documents/self/test.png").convert("L")
img_array = np.array(img, dtype=np.float64)

# 定义卷积核
kernels = {
    "高斯模糊": np.array([[1,2,1],[2,4,2],[1,2,1]]) / 16,
    "均值模糊": np.ones((3,3)) / 9,
    "锐化":     np.array([[0,-1,0],[-1,5,-1],[0,-1,0]]),
    "边缘检测": np.array([[-1,-1,-1],[-1,8,-1],[-1,-1,-1]]),
    "Sobel横向": np.array([[-1,-2,-1],[0,0,0],[1,2,1]]),
}
kernels["高斯模糊5x5"] = np.array([
    [1, 4,  6,  4,  1],
    [4, 16, 24, 16, 4],
    [6, 24, 36, 24, 6],
    [4, 16, 24, 16, 4],
    [1, 4,  6,  4,  1]
]) / 256

# 手写卷积函数
def convolve(image, kernel):
    H, W = image.shape
    out = np.zeros_like(image)
    
    # 从第1行到倒数第1行，跳过边缘
    for y in range(2, H-2):
        for x in range(2, W-2):
            # 取出3×3区域
            region = image[y-2:y+3, x-2:x+3]
            # 对应元素相乘，求和
            out[y, x] = np.sum(region * kernel)
    
    # 截断到合法范围
    return np.clip(out, 0, 255)

# 应用并显示
kernel_name = "高斯模糊5x5"

result = img_array.copy()
for _ in range(5):  # 应用5次，次数越多越模糊
    result = convolve(result, kernels["高斯模糊5x5"])
    print(result)
    print("--------------------------------")

fig, axes = plt.subplots(1, 2, figsize=(10, 5))
axes[0].imshow(img_array, cmap='gray')
axes[0].set_title("原图")
axes[1].imshow(result, cmap='gray')
axes[1].set_title(kernel_name)
plt.show()