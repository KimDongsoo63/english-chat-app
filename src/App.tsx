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
  text: "Ver 1.0.11 - Welcome to English Conversation Practice!",
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
    const initializeVoice = () => {
      if (!window.speechSynthesis) {
        console.error('Speech synthesis not available');
        return;
      }

      // Clear any existing voices
      window.speechSynthesis.cancel();

      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        
        // Specifically look for English female voices
        const preferredVoices = [
          'Microsoft Zira',
          'Google UK English Female',
          'Karen',
          'Samantha',
          'Victoria'
        ];

        let selectedVoice = null;

        // First try to find one of our preferred voices
        for (const preferredName of preferredVoices) {
          const voice = voices.find(v => v.name.includes(preferredName) && v.lang.startsWith('en'));
          if (voice) {
            selectedVoice = voice;
            break;
          }
        }

        // If no preferred voice found, try any female English voice
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => 
            voice.lang.startsWith('en') && (
              voice.name.toLowerCase().includes('female') ||
              voice.name.includes('woman')
            )
          );
        }

        // Last resort: any English voice
        if (!selectedVoice) {
          selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
        }

        if (selectedVoice) {
          console.log('Selected voice:', selectedVoice.name);
          setVoicesLoaded(true);
          return selectedVoice;
        }

        console.warn('No suitable voice found');
        return null;
      };

      // Initial load attempt
      let voice = loadVoices();
      
      // If voices aren't loaded yet, wait for them
      if (!voice && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          voice = loadVoices();
        };
      }
    };

    initializeVoice();

    // Cleanup
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // 웰컴 메시지 초기화 및 재생
  const initializeWelcomeMessage = async () => {
    if (messages.length === 0) {
      setMessages([VERSION_INFO]); // 버전 정보 표시

      try {
        // OpenAI API를 통해 웰컴 메시지 생성
        const response = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: "Generate a warm, friendly welcome message for an English learning app. Keep it natural and concise (2-3 sentences). Focus on encouraging the user to start speaking English."
            }
          ],
          temperature: 0.7,
          max_tokens: 100
        });

        const welcomeText = response.choices[0].message.content || 
          "Hello! I'm your English conversation partner. Let's practice English together!";

        const welcomeMessage: Message = {
          text: welcomeText,
          sender: 'assistant' as const
        };

        setMessages(prev => [...prev, welcomeMessage]);
        
        // 웰컴 메시지 음성 재생
        speakResponse(welcomeText);
      } catch (error) {
        console.error('Error generating welcome message:', error);
        const fallbackMessage: Message = {
          text: "Hello! I'm your English conversation partner. Let's practice English together!",
          sender: 'assistant' as const
        };
        setMessages(prev => [...prev, fallbackMessage]);
        speakResponse(fallbackMessage.text);
      }
    }
  };

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
    setIsListening(true);
    
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
    setIsListening(false);
    
    if (inputText.trim()) {
      handleSend();
    }
  };

  // Enhanced speech response function with duplicate prevention
  const speakResponse = (text: string) => {
    if (!window.speechSynthesis || !voicesLoaded) {
      console.error('Speech synthesis not available or voices not loaded');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    // Use the same voice selection logic as in initialization
    const preferredVoices = [
      'Microsoft Zira',
      'Google UK English Female',
      'Karen',
      'Samantha',
      'Victoria'
    ];

    let selectedVoice = null;

    // Try to find preferred voice
    for (const preferredName of preferredVoices) {
      const voice = voices.find(v => v.name.includes(preferredName) && v.lang.startsWith('en'));
      if (voice) {
        selectedVoice = voice;
        break;
      }
    }

    // Fallback to any female English voice
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => 
        voice.lang.startsWith('en') && (
          voice.name.toLowerCase().includes('female') ||
          voice.name.includes('woman')
        )
      );
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Optimize voice settings
    utterance.rate = 0.9;     // Slightly slower for clarity
    utterance.pitch = 1.1;    // Slightly higher pitch for female voice
    utterance.volume = 1.0;   // Full volume
    utterance.lang = 'en-US';

    // Clear current utterance before starting new one
    if (currentUtterance.current) {
      window.speechSynthesis.cancel();
      currentUtterance.current = null;
    }

    // Set up event handlers
    utterance.onstart = () => {
      console.log('Speech started:', text.substring(0, 20) + '...');
      currentUtterance.current = utterance;
    };

    utterance.onend = () => {
      console.log('Speech ended');
      currentUtterance.current = null;
    };

    utterance.onerror = (event) => {
      console.error('Speech error:', event);
      currentUtterance.current = null;
    };

    // Speak the text
    window.speechSynthesis.speak(utterance);
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
            onClick={isListening ? stopListening : startListening}
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
