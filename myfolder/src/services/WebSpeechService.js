/**
 * Service for handling Web Speech API (Browser Native)
 * Provides Speech-to-Text (STT) and Text-to-Speech (TTS)
 */

class WebSpeechService {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.onResultCallback = null;
        this.onErrorCallback = null;
        this.onEndCallback = null;

        this.initialize();
    }

    initialize() {
        // Check browser support
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new window.webkitSpeechRecognition();
            this.recognition.continuous = false; // Stop after each phrase
            this.recognition.interimResults = false; // Only final results
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                console.log('Voice recognition started');
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                console.log('Voice result:', transcript);
                if (this.onResultCallback) {
                    this.onResultCallback(transcript);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Voice recognition error:', event.error);
                if (this.onErrorCallback) {
                    this.onErrorCallback(event.error);
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                console.log('Voice recognition ended');
                if (this.onEndCallback) {
                    this.onEndCallback();
                }
            };
        } else {
            console.warn('Web Speech API (SpeechRecognition) not supported in this browser.');
        }
    }

    isSupported() {
        return !!this.recognition && !!this.synthesis;
    }

    startListening(onResult, onError, onEnd) {
        if (!this.recognition) {
            if (onError) onError('Browser not supported');
            return;
        }

        this.onResultCallback = onResult;
        this.onErrorCallback = onError;
        this.onEndCallback = onEnd;

        try {
            this.recognition.start();
        } catch (e) {
            console.error('Failed to start recognition:', e);
            if (onError) onError(e.message);
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    speak(text, onEnd) {
        if (!this.synthesis) {
            console.warn('Speech synthesis not supported');
            if (onEnd) onEnd();
            return;
        }

        // Cancel any current speaking
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onend = () => {
            if (onEnd) onEnd();
        };

        utterance.onerror = (e) => {
            console.error('Speech synthesis error:', e);
            if (onEnd) onEnd();
        };

        this.synthesis.speak(utterance);
    }
}

export const webSpeechService = new WebSpeechService();
export default webSpeechService;
