Daily Hero Image Plan
Goal

Generate a new homepage image every day for Study Together, similar to Google Doodles.

Each day includes:

One image
One title
One subtitle
One theme
Automatic display on the homepage

Visual style:

Calm
Literary
Study-focused atmosphere
Slightly futuristic or time-related feeling
Not too crowded or floral
Leave empty space for overlay text
Phase 1 — Fast Launch with GPT Image

Goal: Deliver a complete working version within 2–5 days.

# Daily Hero Image Plan

## Goal

Generate a new homepage image every day for Study Together, similar to Google Doodles.

Each day includes:

- One image
- One title
- One subtitle
- One theme
- Automatic display on the homepage

Visual style:

- Calm
- Literary
- Study-focused atmosphere
- Slightly futuristic or time-related feeling
- Not too crowded or floral
- Leave empty space for overlay text

---

# Phase 1 — Fast Launch with GPT Image

Goal: deliver a complete working version within 2–5 days.

## Architecture

```text
FastAPI Scheduler (APScheduler / Celery Beat / cron)
    ↓
Generate today's theme
    ↓
Generate title / subtitle / image prompt
    ↓
Call GPT Image API
    ↓
Upload image to S3
    ↓
Save to daily_hero table
    ↓
Frontend loads /api/daily-hero

1. Database Table
CREATE TABLE daily_hero (
    id BIGSERIAL PRIMARY KEY,
    hero_date DATE NOT NULL UNIQUE,
    theme VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(500),
    prompt TEXT NOT NULL,
    image_url TEXT NOT NULL,
    generation_model VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
2. Daily Generation Flow

Run automatically every day at 00:05:

1. Generate today's theme
2. Generate title, subtitle, and image prompt
3. Call GPT Image
4. Upload image
5. Save to database
3. Theme Generation Strategy

Prepare a theme pool to keep the style consistent.

Monday    -> beginning / fresh start
Tuesday   -> focus / momentum
Wednesday -> rainy study / quiet persistence
Thursday  -> future / technology / city
Friday    -> warm night / achievement
Saturday  -> exploration / library / world
Sunday    -> reflection / calm / soft light

Combine this with the season.

For April in Tokyo:

spring rain
minimal cherry blossom
warm library morning
quiet Tokyo evening

Example:

theme = "quiet rainy Tokyo study night"
4. Generate Title / Subtitle / Prompt

Prompt for the text model:

Theme: quiet rainy Tokyo study night

Generate:
- short homepage title
- short subtitle
- image generation prompt

Style:
calm, literary, soft, inspiring

Expected output:

{
  "title": "Quietly Glowing Night",
  "subtitle": "You do not need to rush today. Just move forward a little.",
  "prompt": "Wide homepage hero background for a study website. Quiet rainy Tokyo night, warm desk light, books, soft reflections on the window, literary and calm atmosphere, minimal composition, no text, empty space on the right side for overlay title."
}
5. GPT Image Settings

Recommended image size:

1792 × 1024
or 1536 × 1024

Because the homepage hero section needs a wide image.

6. Backend API
GET /api/daily-hero

Example response:

{
  "date": "2026-04-08",
  "theme": "quiet rainy Tokyo study night",
  "title": "Quietly Glowing Night",
  "subtitle": "You do not need to rush today. Just move forward a little.",
  "imageUrl": "https://cdn.xxx.com/daily/2026-04-08.webp"
}
7. Frontend Layout
------------------------------------------------
|                                              |
|              [Background Image]              |
|                                              |
|          Quietly Glowing Night               |
|  You do not need to rush today. Just move    |
|  forward a little.                           |
|                                              |
------------------------------------------------

Suggested style:

Slight dark overlay on the image
Semi-transparent background behind text
Plenty of breathing space
8. Phase 1 Success Criteria
New image generated automatically every day
Stable image quality
Consistent visual style
Homepage updates automatically
Ability to view previous daily images
Phase 2 — FLUX / Stable Diffusion

Goal: Reduce cost, improve style control, and support more customization.

Recommended order:

FLUX
Stable Diffusion later if needed

Why FLUX:

Better artistic quality
More suitable for calm and literary scenes
Easier prompts
Phase 2 Architecture
Spring Boot Scheduler
    ↓
Generate title / subtitle / prompt
    ↓
Call image-service
    ↓
FLUX / Stable Diffusion generates image
    ↓
Upload image to S3
    ↓
Save to daily_hero table
1. Create image-service

Create a separate service:

image-service
- POST /generate-image
- body: prompt, style, aspectRatio

Response:

{
  "imageUrl": "..."
}

This makes it easy to switch models later without changing the main app.

2. Recommended Models
FLUX

Recommended versions:

FLUX.1-dev
FLUX Schnell (faster)

Best for:

Calm study scenes
Future city atmosphere
Night, library, desk, rain, history
Stable Diffusion

Use later if you want:

More control
Custom LoRA styles
A unique "Study Together" visual identity

Recommended:

SDXL
With custom LoRA

Possible future custom style:

study-together-literary-style

So every image feels like part of the same visual universe.

3. Extra Features in Phase 2
Personalized Images

Different users can see different daily images:

Likes night scenes
Likes futuristic themes
Likes libraries
Likes rainy days
Special Events

Examples:

New Year
Cherry blossom season
Exam week
Weekend mode
Weekly Theme Series
Week 1: Tokyo Spring
Week 2: Quiet Libraries
Week 3: Future City
Week 4: History and Time
Recommended Development Timeline
Week 1
- Create database table
- Build API
- Build homepage hero UI
- Insert one manual daily hero entry

Week 2
- Auto-generate title/subtitle/prompt
- Integrate GPT Image
- Upload to S3
- Add scheduler

Week 3
- Improve visual style
- Add history page
- Add special themes

Month 2+
- Create image-service
- Integrate FLUX
- Gradually migrate away from GPT Image
Final Direction

Phase 1 is for quickly building a polished product experience.

Phase 2 is for turning it into a system that fully belongs to your project and style, without depending entirely on external image generation APIs.