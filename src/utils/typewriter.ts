/**
 * 平滑打字機產生器
 * 針對快取、離線 fallback 或非串流端點，以自然擬真的節奏逐字輸出
 */
export async function playTypewriter(
  fullText: string,
  onChunk: (currentText: string) => void,
  speedMs: number = 12
): Promise<void> {
  const chars = Array.from(fullText);
  let current = '';
  const step = chars.length > 250 ? 3 : (chars.length > 100 ? 2 : 1);
  for (let i = 0; i < chars.length; i += step) {
    current += chars.slice(i, i + step).join('');
    onChunk(current);
    await new Promise(r => setTimeout(r, speedMs));
  }
}
