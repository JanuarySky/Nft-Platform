const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");

const app = express();

// Включение CORS
app.use(cors());

// Парсинг JSON из тела запроса
app.use(express.json());

// Директория для сохранения JSON-файлов
const metadataDir = path.join(__dirname, "public/metadata");

// Создаём папку, если она ещё не существует
if (!fs.existsSync(metadataDir)) {
  fs.mkdirSync(metadataDir, { recursive: true });
}

// Настраиваем хранилище для изображений
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const imagesDir = path.join(__dirname, "public/images");
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Инициализация загрузчика
const upload = multer({ storage: imageStorage });

// Маршрут для загрузки изображения
app.post("/uploadImage", upload.single("image"), (req, res) => {
  try {
    const filePath = `/images/${req.file.filename}`;
    const uri = `http://localhost:3001${filePath}`;
    res.status(200).json({ uri });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// Маршрут для обработки JSON
app.post("/uploadMetadata", (req, res) => {
  try {
    const metadata = req.body; // Получаем данные из тела запроса

    // Проверяем, что данные содержат необходимые поля
    if (!metadata.name || !metadata.description || !metadata.attributes) {
      return res.status(400).json({ error: "Invalid metadata format" });
    }

    // Генерируем имя файла
    const filename = `${Date.now()}.json`;

    // Путь к файлу
    const filePath = path.join(metadataDir, filename);

    // Сохраняем данные в файл
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));

    // Возвращаем URI для созданного файла
    const uri = `http://localhost:3001/metadata/${filename}`;
    res.status(200).json({ uri });
  } catch (error) {
    console.error("Error saving metadata:", error);
    res.status(500).json({ error: "Failed to save metadata" });
  }
});

// Обслуживание статических файлов
app.use("/metadata", express.static(metadataDir));
app.use("/images", express.static(path.join(__dirname, "public/images")));

// Запуск сервера
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

