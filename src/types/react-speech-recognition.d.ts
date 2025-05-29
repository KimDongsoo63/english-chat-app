declare module 'react-speech-recognition' {
  export interface SpeechRecognitionResult {
    transcript: string;
    confidence: number;
  }

  interface Command {
    command: string;
    callback: (...args: any[]) => void;
    matchInterim?: boolean;
    isFuzzyMatch?: boolean;
    fuzzyMatchingThreshold?: number;
    bestMatchOnly?: boolean;
  }

  interface SpeechRecognitionOptions {
    commands?: Command[];
    transcribing?: boolean;
    clearTranscriptOnListen?: boolean;
  }

  interface ListeningOptions {
    continuous?: boolean;
    language?: string;
  }

  export interface SpeechRecognitionHook {
    transcript: string;
    listening: boolean;
    resetTranscript: () => void;
    browserSupportsSpeechRecognition: boolean;
    isMicrophoneAvailable: boolean;
    startListening: (options?: ListeningOptions) => void;
    stopListening: () => void;
  }

  const SpeechRecognition: {
    startListening: (options?: ListeningOptions) => void;
    stopListening: () => void;
    abortListening: () => void;
  };

  export function useSpeechRecognition(options?: SpeechRecognitionOptions): SpeechRecognitionHook;
  export default SpeechRecognition;
} 