const prompt = "A breathtaking aerial view of a vibrant summer waterpark landscape at Welli Hilli Park, bathed in bright sunshine. The foreground features a vast expanse of shimmering, crystal-clear blue water with gentle ripples, creating an ideal blank space for text overlay. In the mid-background, colorful water slides, exciting rides, and playful water features are rendered with a pleasing, artistic realistic blur and bokeh effect, subtly conveying energy and fun without distracting from the main message area. The overall composition offers a clean background, evoking a sense of refreshing joy and summer relaxation. Deep blue sky, lush green foliage hints on the edges. Photorealistic, ultra HD, cinematic lighting, 8k, stable diffusion style., highly detailed, 4k, marketing photography, beautiful lighting, clean blank space, no text";

const encodedPrompt = encodeURIComponent(prompt);
const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true&seed=12345`;
console.log("URL length:", imageUrl.length);

async function testFetch() {
  const res = await fetch(imageUrl);
  console.log("Status:", res.status);
  const blob = await res.blob();
  console.log("Size:", blob.size);
}
testFetch();
