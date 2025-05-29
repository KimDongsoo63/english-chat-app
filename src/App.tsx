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

// 버전 정보와 웰컴 메시지
const VERSION_INFO: Message = {
  text: "Ver 1.0.9 - Welcome to English Conversation Practice!",
  sender: 'system'
};

// 웰컴 메시지는 OpenAI를 통해 동적으로 생성될 것이므로 제거
const WELCOME_MESSAGE: Message = {
  text: "",  // Will be populated dynamically
  sender: 'assistant'
};

// OpenAI client configuration
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

const SYSTEM_PROMPT = `You are a friendly female English conversation tutor. Your goal is to help users improve their English through natural conversation. Keep your responses concise (2-3 sentences) and focus on practical, everyday English.

Key Teaching Principles:
1. Assessment & Adaptation:
   - Continuously evaluate user's English level
   - Adjust your language to match their level
   - Keep track of common mistakes
   - Remember conversation context
   - Progress gradually

2. Error Correction:
   - Acknowledge user's meaning first
   - Provide 1-2 simple examples of correct usage
   - Keep corrections brief and natural
   - Focus on major errors only
   - Encourage practice

3. Conversation Flow:
   - Use natural, everyday topics
   - Keep responses short and clear
   - Ask follow-up questions
   - Stay on topic
   - Guide gently

4. Learning Support:
   - Introduce relevant vocabulary
   - Share simple grammar tips
   - Use real-life examples
   - Celebrate improvements
   - Build confidence

Remember:
- Keep responses brief (2-3 sentences)
- Use simple, clear language
- Focus on practical usage
- Be encouraging
- Stay conversational`;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState<NodeJS.Timeout | null>(null);
  const [inactivityTimer, setInactivityTimer] = useState<NodeJS.Timeout | null>(null);
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
          if (silenceTimer) {
            clearTimeout(silenceTimer);
          }
          const timer = setTimeout(() => {
            if (isListening) {
              stopListening();
            }
          }, 3000);
          setSilenceTimer(timer);
        }
      }
    ]
  });

  useEffect(() => {
    if (transcript) {
      setInputText(prev => {
        const newText = prev ? `${prev.trim()} ${transcript}` : transcript;
        return newText.trim();
      });
    }
  }, [transcript]);

  useEffect(() => {
    setIsListening(listening);
  }, [listening]);

  // PWA 설치 이벤트 처리
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Initialize chat with welcome messages
  useEffect(() => {
    const initializeChat = async () => {
      if (messages.length === 0) {
        setMessages([VERSION_INFO]); // 먼저 버전 정보만 표시

        try {
          // Get welcome message from OpenAI
          const response = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
              { 
                role: "system", 
                content: "Generate a warm, friendly welcome message for an English learning app. Ask about the user's interests and learning goals. Keep it natural and concise (2-3 sentences max)." 
              }
            ],
            temperature: 0.7,
            max_tokens: 100
          });

          const welcomeText = response.choices[0].message.content || "Hi! I'm your English conversation partner. What would you like to talk about today?";
          
          const dynamicWelcome: Message = {
            text: welcomeText,
            sender: 'assistant'
          };

          setMessages(prev => [...prev, dynamicWelcome]);
          
          // Immediately speak the welcome message
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            setTimeout(() => {
              speakResponse(welcomeText);
            }, 500); // Short delay to ensure voices are loaded
          }
        } catch (error) {
          console.error('Error generating welcome message:', error);
          // Fallback welcome message if API fails
          const fallbackWelcome: Message = {
            text: "Hi! I'm your English conversation partner. What would you like to talk about today?",
            sender: 'assistant'
          };
          setMessages(prev => [...prev, fallbackWelcome]);
          speakResponse(fallbackWelcome.text);
        }
      }
    };

    initializeChat();
  }, []);

  // Check for updates when the app starts
  useEffect(() => {
    const checkForUpdates = async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.waiting) {
          setIsUpdateAvailable(true);
        }

        // Listen for new updates
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      }
    };

    checkForUpdates();
  }, []);

  // Handle update installation
  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    }
  };

  // Initialize voices with specific female voice preferences
  useEffect(() => {
    const loadVoices = () => {
      window.speechSynthesis.cancel();
      const voices = window.speechSynthesis.getVoices();
      
      // 선호하는 여성 음성 목록 (영어 원어민 여성 음성 우선)
      const preferredVoices = [
        'Microsoft Zira',
        'Google US English Female',
        'Samantha',
        'Karen',
        'Victoria',
        'Moira',
        'Tessa'
      ];

      let selectedVoice = null;

      // 1. 정확한 이름 매칭으로 찾기
      for (const voiceName of preferredVoices) {
        selectedVoice = voices.find(v => 
          v.name.toLowerCase().includes(voiceName.toLowerCase()) && 
          v.lang.startsWith('en')
        );
        if (selectedVoice) {
          console.log('Found preferred voice:', selectedVoice.name);
          break;
        }
      }

      // 2. 여성 음성 찾기
      if (!selectedVoice) {
        selectedVoice = voices.find(v => 
          v.name.toLowerCase().includes('female') && 
          v.lang.startsWith('en')
        );
        if (selectedVoice) {
          console.log('Found female voice:', selectedVoice.name);
        }
      }

      // 3. 마지막 대안: 영어 음성 중 첫 번째
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('en'));
        if (selectedVoice) {
          console.log('Using fallback voice:', selectedVoice.name);
        }
      }

      if (selectedVoice) {
        console.log('Selected voice:', selectedVoice.name);
        setVoicesLoaded(true);
        
        // 음성 품질 테스트
        const testUtterance = new SpeechSynthesisUtterance('Voice system initialized.');
        testUtterance.voice = selectedVoice;
        testUtterance.rate = 0.9;  // 자연스러운 속도
        testUtterance.pitch = 1.2; // 여성스러운 피치
        testUtterance.volume = 1.0; // 최대 볼륨
        testUtterance.onend = () => {
          console.log('Voice test completed successfully');
          // 음성 테스트 완료 후 웰컴 메시지 재생 시도
          const welcomeMessage = messages.find(m => m.sender === 'assistant');
          if (welcomeMessage && welcomeMessage.text) {
            speakResponse(welcomeMessage.text);
          }
        };
        testUtterance.onerror = (e) => console.error('Voice test failed:', e);
        window.speechSynthesis.speak(testUtterance);
      } else {
        console.error('No suitable voice found');
        setVoicesLoaded(false);
      }
    };

    // 초기 로드 시도
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      // 음성 목록이 이미 로드되어 있는지 확인
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        loadVoices();
      }
      
      // 음성 목록 변경 이벤트 리스너 등록
      window.speechSynthesis.onvoiceschanged = () => {
        console.log('Voices changed, reloading voices...');
        loadVoices();
      };
    }

    // 5초 간격으로 최대 5번 재시도
    let retryCount = 0;
    const retryInterval = setInterval(() => {
      if (!voicesLoaded && retryCount < 5) {
        console.log(`Retrying voice initialization (attempt ${retryCount + 1}/5)...`);
        loadVoices();
        retryCount++;
      } else {
        clearInterval(retryInterval);
      }
    }, 5000);

    return () => {
      clearInterval(retryInterval);
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [voicesLoaded, messages]);

  const stopAIVoice = () => {
    if (currentUtterance.current) {
      window.speechSynthesis.cancel();
      currentUtterance.current = null;
    }
  };

  const startListening = async () => {
    if (currentUtterance.current) {
      stopAIVoice();
    }
    
    resetTranscript();
    setInputText('');
    
    try {
      await SpeechRecognition.startListening({ 
        continuous: true, 
        language: 'en-US'
      });
    } catch (error) {
      console.error('Speech recognition error:', error);
      setIsListening(false);
      setMessages(prev => [...prev, {
        text: "Sorry, there was a problem with the speech recognition. Please try again.",
        sender: 'system'
      }]);
    }
  };

  const stopListening = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
    SpeechRecognition.stopListening();
    
    setTimeout(() => {
      if (inputText.trim()) {
        handleSend();
      }
    }, 500);
  };

  // Enhanced speech response function with better error handling and voice quality
  const speakResponse = (text: string) => {
    if (!window.speechSynthesis || !voicesLoaded) {
      console.error('Speech synthesis not available or voices not loaded');
      return;
    }

    // 기존 음성 취소
    window.speechSynthesis.cancel();

    // 텍스트 전처리
    const cleanText = text
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // 이모지 제거
      .replace(/[^\w\s.,!?-]/g, '') // 특수문자 제거
      .trim();

    if (!cleanText) {
      console.error('No text to speak after cleaning');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    
    // 여성 음성 선택 로직 개선
    const femaleVoices = voices.filter(voice => 
      voice.lang.startsWith('en') && (
        voice.name.includes('Microsoft Zira') || 
        voice.name.includes('Google US English Female') ||
        voice.name.toLowerCase().includes('female') ||
        voice.name.includes('Samantha') ||
        voice.name.includes('Karen') ||
        voice.name.includes('Victoria') ||
        voice.name.includes('Moira') ||
        voice.name.includes('Tessa')
      )
    );

    // 사용 가능한 모든 여성 음성 로깅
    console.log('Available female voices:', femaleVoices.map(v => v.name));

    if (femaleVoices.length > 0) {
      // 우선순위에 따라 음성 선택
      const preferredVoice = femaleVoices.find(voice => 
        voice.name.includes('Microsoft Zira') ||
        voice.name.includes('Google US English Female')
      ) || femaleVoices[0];

      utterance.voice = preferredVoice;
      console.log('Selected voice:', preferredVoice.name);
    } else {
      console.warn('No female voice found, trying to set a higher pitch');
      // 여성 음성을 찾지 못한 경우 피치를 높여서 여성스러운 음성으로 조정
      utterance.pitch = 1.3;
    }

    // 음성 품질 최적화
    utterance.rate = 0.9;     // 자연스러운 속도
    utterance.volume = 1.0;   // 최대 볼륨
    utterance.lang = 'en-US';

    // 음성 이벤트 핸들러
    utterance.onstart = () => {
      console.log('Speech started');
      currentUtterance.current = utterance;
    };

    utterance.onend = () => {
      console.log('Speech ended successfully');
      currentUtterance.current = null;
      if (!isListening && !loading) {
        startListening();
      }
    };

    utterance.onerror = (event) => {
      console.error('Speech error:', event);
      currentUtterance.current = null;
      
      // 오류 발생 시 한 번 재시도
      setTimeout(() => {
        console.log('Retrying speech...');
        window.speechSynthesis.speak(utterance);
      }, 1000);
    };

    // 음성 출력 시도
    try {
      window.speechSynthesis.speak(utterance);
      
      // 음성이 시작되지 않으면 재시도
      setTimeout(() => {
        if (currentUtterance.current === null) {
          console.log('Speech did not start, retrying...');
          window.speechSynthesis.speak(utterance);
        }
      }, 1000);
    } catch (error) {
      console.error('Speech synthesis failed:', error);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    setLoading(true);
    resetInactivityTimer();
    
    const userMessage: Message = {
      text: inputText,
      sender: 'user'
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    resetTranscript();

    try {
      // Analyze user's response
      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "Analyze the user's message to determine: 1) English level (beginner/intermediate/advanced) 2) Grammar mistakes 3) Vocabulary level 4) Areas for improvement. Keep the analysis brief and focused. Return as JSON."
          },
          {
            role: "user",
            content: userMessage.text
          }
        ],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(analysisResponse.choices[0].message.content || "{}");
      
      // Update user context
      setUserContext(prev => ({
        ...prev,
        proficiencyLevel: analysis.level || prev.proficiencyLevel,
        commonMistakes: [...prev.commonMistakes, ...(analysis.mistakes || [])].slice(-5),
        recentTopics: [...prev.recentTopics, analysis.topic || ''].slice(-3),
        practicedGrammar: [...prev.practicedGrammar, ...(analysis.grammarPoints || [])].slice(-5)
      }));

      // Get conversational response
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { 
            role: "system", 
            content: `Current user context: Level: ${userContext.proficiencyLevel}, Recent topics: ${userContext.recentTopics.join(', ')}, Common mistakes: ${userContext.commonMistakes.join(', ')}. Keep response brief and natural.`
          },
          ...newMessages.map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.text
          }))
        ],
        temperature: 0.7,
        max_tokens: 150  // Limit response length
      });

      const aiResponse = response.choices[0].message.content || '';
      
      const assistantMessage: Message = {
        text: aiResponse,
        sender: 'assistant'
      };

      setMessages([...newMessages, assistantMessage]);
      if (aiResponse) {
        speakResponse(aiResponse);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages([...newMessages, {
        text: "I'm sorry, but I'm having trouble connecting. Could you please try again?",
        sender: 'assistant'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Function to handle user inactivity
  const handleInactivity = async () => {
    const timeSinceLastInteraction = Date.now() - lastUserInteraction;
    if (timeSinceLastInteraction >= 25000) {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            { 
              role: "system", 
              content: `Generate a brief, engaging prompt for a ${userContext.proficiencyLevel} level English learner. 
                       Recent topics: ${userContext.recentTopics.join(', ')}. 
                       Keep it very short and natural. Ask only one question.` 
            }
          ],
          temperature: 0.7,
          max_tokens: 50
        });

        const promptText = response.choices[0].message.content || "Would you like to continue our conversation?";
        
        const promptMessage: Message = {
          text: promptText,
          sender: 'assistant'
        };
        
        setMessages(prev => [...prev, promptMessage]);
        speakResponse(promptMessage.text);
        setLastUserInteraction(Date.now());
      } catch (error) {
        console.error('Error generating prompt:', error);
      }
    }
  };

  // Reset inactivity timer on user interaction
  const resetInactivityTimer = () => {
    setLastUserInteraction(Date.now());
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    const timer = setTimeout(handleInactivity, 25000);
    setInactivityTimer(timer);
  };

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

  // 음성 인식 상태 변경 감지
  useEffect(() => {
    const handleSpeechStart = () => {
      setIsListening(true);
    };

    const handleSpeechEnd = () => {
      if (isListening) {
        stopListening();
      }
    };

    // 음성 인식 이벤트 리스너 등록
    if (browserSupportsSpeechRecognition) {
      window.addEventListener('speechstart', handleSpeechStart);
      window.addEventListener('speechend', handleSpeechEnd);
    }

    return () => {
      if (browserSupportsSpeechRecognition) {
        window.removeEventListener('speechstart', handleSpeechStart);
        window.removeEventListener('speechend', handleSpeechEnd);
      }
    };
  }, [isListening, browserSupportsSpeechRecognition]);

  // 음성 인식 에러 처리
  useEffect(() => {
    const handleError = (event: any) => {
      console.error('Speech recognition error:', event);
      setIsListening(false);
      // 사용자에게 에러 메시지 표시
      setMessages(prev => [...prev, {
        text: "Sorry, there was a problem with the speech recognition. Please try again.",
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

  // 마이크 버튼 클릭 핸들러
  const handleMicClick = async () => {
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
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
        <h2 className="chat-subtitle">막무가내 영어회화</h2>
      </div>
      
      <div className="chat-messages">
        {messages.map((message, index) => (
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
        {loading && (
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
          <button
            onClick={handleMicClick}
            className={`mic-button ${isListening ? 'active' : ''}`}
            disabled={loading}
          >
            {isListening ? '🎤 Stop' : '🎤 Start'}
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !inputText.trim() || isListening}
            className="send-button"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
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
