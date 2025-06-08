import React, { useState, useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import OpenAI from 'openai';
import './App.css';

interface Message {
  text: string;
  sender: 'user' | 'assistant' | 'system';
}

interface UserContext {
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced';
  recentTopics: string[];
  practicedGrammar: string[];
  introducedVocab: string[];
  commonMistakes: string[];
  interests: string[];
  learningGoals: string[];
  preferredTopics: string[];
}

// 버전 정보 텍스트 (채팅앱 상단에 표시)
const VERSION_DISPLAY = "Ver 1.0.20";

// 웰컴 메시지
const WELCOME_MESSAGE: Message = {
  text: "Hey! How's your day going so far? Found any new books or hobbies lately?",
  sender: 'assistant'
};

// OpenAI client configuration
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

// 시스템 프롬프트 개선
const SYSTEM_PROMPT = `You are a friendly English conversation partner helping users improve their English speaking skills.

Key Points:
1. Maintain natural conversation flow
2. Adjust your language level to match the user
3. Provide gentle corrections when needed
4. Keep the conversation engaging and encouraging
5. Focus on practical, daily conversation topics

Response Format:
1. First, respond naturally to continue the conversation
2. Then, if needed, add a brief correction (marked with 💡)
3. Keep responses concise but natural

Example:
User: "I go to store yesterday"
Assistant: "Oh, you went shopping yesterday! What did you buy? 
💡 Quick tip: Use 'went' for past actions."

Remember:
- Be encouraging and friendly
- Focus on communication over perfect grammar
- Keep the conversation flowing naturally
- Help build confidence`;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState<NodeJS.Timeout | null>(null);
  const [inactivityTimer, setInactivityTimer] = useState<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [lastUserInteraction, setLastUserInteraction] = useState(Date.now());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userContext, setUserContext] = useState<UserContext>({
    proficiencyLevel: 'beginner',
    recentTopics: [],
    practicedGrammar: [],
    introducedVocab: [],
    commonMistakes: [],
    interests: [],
    learningGoals: [],
    preferredTopics: []
  });
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const {
    transcript,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    listening
  } = useSpeechRecognition({
    commands: [
      {
        command: '*',
        callback: () => {
          // 음성 인식 중에는 입력 텍스트만 업데이트
          if (!isListening) return;
          setInputText(transcript.trim());
        }
      }
    ]
  });

  // 음성 인식 설정 최적화
  useEffect(() => {
    if (browserSupportsSpeechRecognition) {
      // @ts-ignore (SpeechRecognition 설정을 위해 무시)
      const recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new recognition();
      
      // 인식 품질 향상을 위한 설정
      recognitionInstance.continuous = true; // 연속 인식 모드
      recognitionInstance.interimResults = true; // 중간 결과 활성화
      recognitionInstance.maxAlternatives = 3; // 대체 인식 결과 수 증가
      
      // 음성 인식 품질 설정
      recognitionInstance.lang = 'en-US'; // 미국 영어로 설정
      
      // MediaTrackConstraints 설정
      // @ts-ignore
      if (recognitionInstance.mediaDevices && recognitionInstance.mediaDevices.getUserMedia) {
        // @ts-ignore
        recognitionInstance.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000
          }
        });
      }
    }
  }, [browserSupportsSpeechRecognition]);

  // 음성 입력 처리를 위한 별도의 함수
  const handleVoiceInput = React.useCallback((text: string) => {
    if (!text || loading) return;

    // 음성 인식 결과 전처리
    let processedText = text
      .trim()
      .replace(/\s+/g, ' ') // 중복 공백 제거
      .replace(/[.,!?;:]$/, ''); // 문장 끝 구두점 제거

    // 최소 단어 수 확인 (너무 짧은 인식 결과 무시)
    if (processedText.split(' ').length < 2) {
      console.log('Recognition result too short, ignoring:', processedText);
      return;
    }

    // 메시지 추가
    const userMessage: Message = {
      text: processedText,
      sender: 'user'
    };

    setMessages(prev => [...prev, userMessage]);
    handleSendMessage(processedText, [...messages, userMessage]);
  }, [loading, messages]);

  // 음성 인식 이벤트 핸들러
  useEffect(() => {
    const handleSpeechStart = () => {
      setIsListening(true);
    };

    const handleSpeechEnd = () => {
      if (isListening && transcript.trim()) {
        handleVoiceInput(transcript.trim());
      } else if (isListening) {
        // 음성이 없으면 그냥 종료
        SpeechRecognition.stopListening();
        setIsListening(false);
        resetTranscript();
      }
    };

    if (browserSupportsSpeechRecognition) {
      window.addEventListener('speechend', handleSpeechEnd);
      window.addEventListener('speechstart', handleSpeechStart);
    }

    return () => {
      if (browserSupportsSpeechRecognition) {
        window.removeEventListener('speechend', handleSpeechEnd);
        window.removeEventListener('speechstart', handleSpeechStart);
      }
    };
  }, [browserSupportsSpeechRecognition, isListening, transcript, handleVoiceInput]);

  // Function to handle user inactivity
  const handleInactivity = async () => {
    // 이미 로딩 중이거나 음성 인식 중이면 무시
    if (loading || isListening) return;

    try {
      setLoading(true);
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { 
            role: "system", 
            content: `You are helping a complete beginner learn English. 
- Always choose a new, non-repetitive topic from: daily routine, hobbies, food, weather, family, travel, movies, music, sports, pets, school, shopping, feelings, weekend, friends, places, colors, clothes, seasons, holidays, transportation, technology, dreams, plans, chores, or any other simple daily topic.
- Never repeat the same topic twice in a row.
- Ask a very simple, friendly question about that topic.
- Give one short, clear example answer.
- Use only basic vocabulary and grammar.
- Keep the total response under 30 words.
- Format: "Let's talk about [topic]! [question] For example: [simple example]"
- Make it fun and encouraging.`
          }
        ],
        temperature: 1.0,
        max_tokens: 50
      });

      const promptText = response.choices[0].message.content || "Let's talk about your day! What did you do today? For example: I went to the park.";
      
      const promptMessage: Message = {
        text: promptText,
        sender: 'assistant'
      };
      
      setMessages(prev => [...prev, promptMessage]);
      
      // 음성 출력 및 타이머 시작
      setTimeout(() => {
        speakResponse(promptMessage.text);
        // 새로운 주제 제시 후 타이머 시작
        startInactivityTimer();
      }, 500);
    } catch (error) {
      console.error('Error generating prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  // 음성 출력 함수
  const speakResponse = (text: string) => {
    if (!window.speechSynthesis) {
      console.error('Speech synthesis not available');
      return;
    }

    // 이전 음성 출력 중지
    window.speechSynthesis.cancel();
    if (currentUtterance.current) {
      currentUtterance.current = null;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 영어 음성 선택
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(voice => 
      voice.lang.startsWith('en') && voice.name.includes('Female')
    ) || voices.find(voice => voice.lang.startsWith('en'));
    
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    // 음성 설정
    utterance.rate = 0.9;  // 자연스러운 속도
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    // 이벤트 핸들러
    utterance.onstart = () => {
      currentUtterance.current = utterance;
      console.log('Speech started');
    };

    utterance.onend = () => {
      currentUtterance.current = null;
      console.log('Speech ended');
    };

    utterance.onerror = (event) => {
      console.error('Speech error:', event);
      currentUtterance.current = null;
    };

    // 음성 출력 시작
    window.speechSynthesis.speak(utterance);
  };

  // 타이머 초기화 함수
  const clearInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      setInactivityTimer(null);
    }
    setCountdown(0);
  };

  // AI 응답 후 타이머 시작 함수
  const startInactivityTimer = () => {
    // 기존 타이머 초기화
    clearInactivityTimer();
    
    // 음성 출력이 끝나면 타이머 시작
    const startTimer = () => {
      setCountdown(20);
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const timer = setTimeout(() => {
        setInactivityTimer(null);
        clearInterval(countdownInterval);
        setCountdown(0);
        handleInactivity();
      }, 20000);

      setInactivityTimer(timer);
    };

    // 현재 음성이 끝나면 타이머 시작
    if (currentUtterance.current) {
      currentUtterance.current.onend = () => {
        startTimer();
      };
    } else {
      startTimer();
    }
  };

  // 메시지 전송 핸들러
  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const messageText = inputText.trim();
    
    // 사용자 메시지 생성 및 표시
    const userMessage: Message = {
      text: messageText,
      sender: 'user'
    };
    
    // 메시지 추가 및 AI 응답 요청
    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      handleSendMessage(messageText, newMessages);
      return newMessages;
    });
    
    setInputText('');
    resetTranscript();
  };

  // 마이크 버튼 클릭 핸들러 수정
  const handleMicClick = async () => {
    // 현재 음성 출력 중지
    if (currentUtterance.current) {
      stopAIVoice();
    }

    // 타이머 초기화
    clearInactivityTimer();

    // 이미 처리 중이면 무시
    if (loading) {
      console.log('Loading in progress, ignoring mic click');
      return;
    }

    if (isListening) {
      // STOP 버튼을 클릭했을 때
      if (transcript.trim()) {
        handleVoiceInput(transcript.trim());
      }
      // 음성 인식 종료
      SpeechRecognition.stopListening();
      setIsListening(false);
      resetTranscript();
    } else {
      try {
        resetTranscript();
        setInputText('');
        
        // 음성 인식 시작 시 고품질 설정 적용
        await SpeechRecognition.startListening({
          continuous: true,
          language: 'en-US'
        });
        setIsListening(true);
      } catch (error) {
        console.error('Speech recognition error:', error);
        setIsListening(false);
        setMessages(prev => [...prev, {
          text: "Sorry, there was a problem with the microphone. Please try again.",
          sender: 'system'
        }]);
      }
    }
  };

  // 음성 인식 상태 동기화
  useEffect(() => {
    if (!listening && isListening) {
      console.log('Speech recognition stopped unexpectedly');
      if (transcript.trim()) {
        handleVoiceInput(transcript.trim());
      } else {
        setIsListening(false);
        resetTranscript();
      }
    }
  }, [listening]);

  // transcript 변경 감지
  useEffect(() => {
    if (!isListening) return;
    setInputText(transcript.trim());
  }, [transcript, isListening]);

  // 음성 인식 에러 처리
  useEffect(() => {
    const handleError = (event: any) => {
      console.error('Speech recognition error:', event);
      setIsListening(false);
      
      // 사용자에게 더 자세한 에러 메시지 표시
      let errorMessage = "Sorry, there was a problem with the speech recognition. ";
      if (event.error === 'no-speech') {
        errorMessage += "No speech was detected. Please try again.";
      } else if (event.error === 'audio-capture') {
        errorMessage += "Please check your microphone.";
      } else if (event.error === 'not-allowed') {
        errorMessage += "Please allow microphone access.";
      } else {
        errorMessage += "Please try again.";
      }
      
      setMessages(prev => [...prev, {
        text: errorMessage,
        sender: 'system'
      }]);
    };

    if (browserSupportsSpeechRecognition) {
      window.addEventListener('error', handleError);
    }

    return () => {
      if (browserSupportsSpeechRecognition) {
        window.removeEventListener('error', handleError);
      }
    };
  }, [browserSupportsSpeechRecognition]);

  const stopAIVoice = () => {
    if (currentUtterance.current) {
      window.speechSynthesis.cancel();
      currentUtterance.current = null;
    }
  };

  // PWA 업데이트 핸들러
  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    }
    setIsUpdateAvailable(false);
  };

  // 초기 메시지 설정
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([WELCOME_MESSAGE]);
      // 웰컴 메시지 음성 출력
      setTimeout(() => {
        speakResponse(WELCOME_MESSAGE.text);
      }, 1000);
    }
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 설치 프롬프트 표시 함수
  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: { outcome: string }) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        setDeferredPrompt(null);
        setShowInstallPrompt(false);
      });
    }
  };

  // handleSendMessage 함수 수정 - 간단한 응답과 타이머 로직
  const handleSendMessage = async (messageText: string, currentMessages: Message[]) => {
    if (loading) {
      console.log('Already processing a message, ignoring:', messageText);
      return;
    }

    setLoading(true);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { 
            role: "system", 
            content: `You are helping a complete beginner learn English. Follow these rules strictly:
                     1. Keep responses very short and simple (max 2 sentences)
                     2. If there's a grammar mistake:
                        - First give a brief, natural response
                        - Then say "Correction:" and show the right way
                        - Give a quick example
                     3. If no mistakes:
                        - Just give a friendly, natural response
                        - Ask a simple follow-up question
                     4. Use only basic vocabulary
                     5. Total response must be under 30 words
                     6. Never use emojis or special characters
                     7. Be encouraging but brief`
          },
          ...currentMessages.map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.text
          }))
        ],
        temperature: 0.7,
        max_tokens: 50
      });

      const aiResponse = response.choices[0].message.content;
      
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      const assistantMessage: Message = {
        text: aiResponse,
        sender: 'assistant'
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // AI 응답 후 음성 출력
      setTimeout(() => {
        speakResponse(aiResponse);
        // 음성 출력 완료 후 타이머 시작
        startInactivityTimer();
      }, 500);

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        text: "I'm sorry, I couldn't understand. Can you say that again?",
        sender: 'assistant'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Cancel 버튼 핸들러 추가
  const handleMicCancel = () => {
    if (currentUtterance.current) {
      stopAIVoice();
    }
    
    // 음성 인식 종료
    SpeechRecognition.stopListening();
    setIsListening(false);
    resetTranscript();
    setInputText('');
  };

  if (!browserSupportsSpeechRecognition) {
    return <div>Browser doesn't support speech recognition.</div>;
  }

  if (!isMicrophoneAvailable) {
    return <div>Please allow microphone access to use voice input.</div>;
  }

  return (
    <div className="chat-interface">
      {showInstallPrompt && (
        <div className="install-prompt">
          <div className="install-prompt-content">
            <p>📱 앱을 설치하면 더 편리하게 이용할 수 있습니다!</p>
            <button onClick={handleInstallClick}>설치하기</button>
            <button onClick={() => setShowInstallPrompt(false)}>나중에</button>
          </div>
        </div>
      )}
      {isUpdateAvailable && (
        <div className="install-prompt">
          <div className="install-prompt-content">
            <p>🔄 새로운 버전이 있습니다. 업데이트하시겠습니까?</p>
            <button onClick={handleUpdate}>업데이트</button>
            <button onClick={() => setIsUpdateAvailable(false)}>나중에</button>
          </div>
        </div>
      )}
      <div className="title-container">
        <h1 className="chat-title">
          <div className="title-main">
            <span>💬</span>
            <span>NoPlan, JustTalk</span>
          </div>
        </h1>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '-8px', marginBottom: '4px', textAlign: 'center' }}>Ver 1.0.20</div>
      </div>
      
      <div className="chat-messages">
        {messages
          .filter((message) => message.text !== 'Ver 1.0.12')
          .map((message, index) => (
            <div key={index} className={`message-container ${message.sender}-container`}>
              <div className={`message ${message.sender}-message`}>
                {message.text}
                {message.sender === 'assistant' && !isListening && (
                  <button 
                    className="replay-button"
                    onClick={() => speakResponse(message.text)}
                    aria-label="Replay message"
                    disabled={isListening}
                  >
                    🔊
                  </button>
                )}
              </div>
            </div>
        ))}
        {loading && !isListening && (
          <div className="message-container assistant-container">
            <div className="message assistant-message">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-controls">
        <div className="chat-input-container">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isListening ? 'Listening...' : 'Type your message...'}
            className="chat-input"
            disabled={loading || isListening}
          />
          <div className="button-container">
            <button
              onClick={handleMicClick}
              className={`mic-button ${isListening ? 'stop' : 'start'}`}
              disabled={loading && !isListening}
            >
              {isListening ? '🔴 Stop' : '🎤 Start'}
            </button>
            <button
              onClick={handleMicCancel}
              className="cancel-button"
              disabled={!isListening}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={loading || !inputText.trim() || isListening}
              className="send-button"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
        {isListening && (
          <div className="listening-indicator">
            Listening... Speak in English
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
