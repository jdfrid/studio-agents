export interface PcmFormat {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

export function isRawPcmMimeType(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return lower.startsWith("audio/l16") || lower.includes("codec=pcm") || lower === "audio/pcm";
}

export function parsePcmMimeType(mimeType: string): PcmFormat {
  const rateMatch = /rate=(\d+)/i.exec(mimeType);
  const bitsMatch = /(?:bits=(\d+)|l16)/i.exec(mimeType);
  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
    bitsPerSample: bitsMatch?.[1] ? Number(bitsMatch[1]) : 16,
    channels: 1
  };
}

export function pcmToWav(pcm: Buffer, format: PcmFormat): Buffer {
  const { sampleRate, bitsPerSample, channels } = format;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function normalizeAudioForPlayback(body: Buffer, mimeType: string): { body: Buffer; mimeType: string; extension: string } {
  if (!isRawPcmMimeType(mimeType)) {
    if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") {
      return { body, mimeType: "audio/mpeg", extension: "mp3" };
    }
    if (mimeType === "audio/wav" || mimeType === "audio/wave") {
      return { body, mimeType: "audio/wav", extension: "wav" };
    }
    return { body, mimeType, extension: "bin" };
  }
  const format = parsePcmMimeType(mimeType);
  return {
    body: pcmToWav(body, format),
    mimeType: "audio/wav",
    extension: "wav"
  };
}
