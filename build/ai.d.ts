export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export declare function buildSystemPrompt(userName: string): string;
export declare function acceptVisionLicense(): Promise<void>;
export declare function generateText(history: Message[]): Promise<string>;
export declare function generateImage(prompt: string): Promise<Buffer>;
export declare function analyzeImage(imageBuffer: Buffer, question: string): Promise<string>;
//# sourceMappingURL=ai.d.ts.map