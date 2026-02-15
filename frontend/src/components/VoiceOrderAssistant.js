import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  Alert,
  Header,
  Container,
  StatusIndicator,
  ColumnLayout,
  FormField,
  Badge,
  Link,
  ExpandableSection
} from '@cloudscape-design/components';
import webSpeechService from '../services/WebSpeechService';

const VoiceOrderAssistant = ({ visible, onDismiss, onOrderCreated }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderData, setOrderData] = useState({});
  const [conversationHistory, setConversationHistory] = useState([]);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [error, setError] = useState(null);
  const [automationMethod, setAutomationMethod] = useState('strands');
  const [collectedFields, setCollectedFields] = useState([]);
  const [missingFields, setMissingFields] = useState(['product_name', 'quantity', 'retailer']);
  const [lastHeard, setLastHeard] = useState('');

  const requiredFields = ['product_name', 'quantity', 'retailer'];

  // CRITICAL: Refs to prevent stale closures in voice callbacks
  const orderDataRef = useRef({});
  const historyRef = useRef([]);

  useEffect(() => {
    if (visible) {
      startConversation();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      webSpeechService.stopListening();
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const getProductUrl = (data = orderDataRef.current) => {
    if (!data.product_name) return null;
    const query = encodeURIComponent(data.product_name);
    const retailer = (data.retailer || 'Amazon').toLowerCase();

    if (retailer === 'amazon') return `https://www.amazon.com/s?k=${query}`;
    if (retailer === 'amazon grocery' || retailer === 'amazon fresh') return `https://www.amazon.com/s?k=${query}&i=amazonfresh`;
    if (retailer === 'walmart') return `https://www.walmart.com/search?q=${query}`;
    if (retailer === 'target') return `https://www.target.com/s?searchTerm=${query}`;
    return `https://www.google.com/search?q=${query}`;
  };

  const startConversation = () => {
    setError(null);
    setIsRecording(false);
    setIsProcessing(false);
    setReadyToSubmit(false);
    setLastHeard('');

    // Reset Context
    orderDataRef.current = {};
    setOrderData({});

    const greetingText = "Hello! I'm your order assistant. What product would you like to buy today?";
    const initialHistory = [{
      role: 'assistant',
      text: greetingText,
      timestamp: new Date().toISOString()
    }];

    historyRef.current = initialHistory;
    setConversationHistory(initialHistory);

    setCollectedFields([]);
    setMissingFields(['product_name', 'quantity', 'retailer']);

    // Speak
    webSpeechService.speak(greetingText);
  };

  const startListening = () => {
    setIsRecording(true);
    setError(null);

    webSpeechService.startListening(
      (transcript) => {
        setIsRecording(false);
        processVoiceInput(transcript);
      },
      (err) => {
        setIsRecording(false);
        setError('Listening failed: ' + err);
      },
      () => {
        setIsRecording(false);
      }
    );
  };

  const stopListening = () => {
    webSpeechService.stopListening();
    setIsRecording(false);
  };

  const processVoiceInput = (text) => {
    if (!text) return;

    setLastHeard(text);
    console.log("Processing input:", text);
    setIsProcessing(true);

    // Get current state from refs
    const currentOrderData = { ...orderDataRef.current };
    const currentHistory = [...historyRef.current];

    // Check for "yes"/"submit" confirmations
    if (readyToSubmit && (text.toLowerCase().includes("yes") || text.toLowerCase().includes("submit") || text.toLowerCase().includes("ok") || text.toLowerCase().includes("go ahead"))) {
      submitOrder();
      return;
    }

    // Add user message to history
    const userMessage = {
      role: 'user',
      text: text,
      timestamp: new Date().toISOString()
    };
    const updatedHistory = [...currentHistory, userMessage];

    // Parse the input
    let textToParse = text.toLowerCase();
    const newOrderData = { ...currentOrderData };

    // 1. Quantity Extraction
    const numberWords = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    const digMatch = textToParse.match(/(\d+)/);
    if (digMatch) {
      newOrderData.quantity = parseInt(digMatch[0]);
      textToParse = textToParse.replace(digMatch[0], '');
    } else {
      for (const [word, digit] of Object.entries(numberWords)) {
        if (new RegExp(`\\b${word}\\b`).test(textToParse)) {
          newOrderData.quantity = digit;
          textToParse = textToParse.replace(new RegExp(`\\b${word}\\b`), '');
          break;
        }
      }
    }

    // 2. Retailer Extraction
    const retailers = ['amazon grocery', 'amazon fresh', 'amazon', 'walmart', 'target', 'costco'];
    for (const retailer of retailers) {
      if (textToParse.includes(retailer)) {
        // Normalize name
        if (retailer === 'amazon grocery' || retailer === 'amazon fresh') {
          newOrderData.retailer = 'Amazon Grocery';
        } else {
          newOrderData.retailer = retailer.charAt(0).toUpperCase() + retailer.slice(1);
        }
        textToParse = textToParse.replace(retailer, '');
        break;
      }
    }

    // 3. Product Extraction
    if (!newOrderData.product_name) {
      const fillers = ['i want', 'i need', 'buy', 'purchase', 'order', 'can i get', 'please', 'looking for', 'search for', 'find', 'from', 'a', 'an', 'the'];
      let prodText = textToParse;
      fillers.forEach(f => {
        prodText = prodText.replace(new RegExp(`\\b${f}\\b`, 'gi'), '');
      });
      const potential = prodText.replace(/[.,?!]/g, '').replace(/\s+/g, ' ').trim();
      if (potential.length > 0) {
        newOrderData.product_name = potential;
      } else {
        // Hard fallback
        const fallback = text.replace(/i want|i need|buy|purchase|order|please/gi, '').replace(/[.,?!]/g, '').trim();
        if (fallback.length > 0) newOrderData.product_name = fallback;
      }
    }

    // Update refs and state
    orderDataRef.current = newOrderData;
    setOrderData(newOrderData);

    const collected = requiredFields.filter(f => newOrderData[f]);
    const missing = requiredFields.filter(f => !newOrderData[f]);
    setCollectedFields(collected);
    setMissingFields(missing);

    // Determine Assistant Response
    let assistantResponse = "";
    if (!newOrderData.product_name) {
      assistantResponse = "I didn't catch the product name. What do you want to buy?";
    } else if (!newOrderData.quantity) {
      assistantResponse = `Got it, ${newOrderData.product_name}. How many do you want?`;
    } else if (!newOrderData.retailer) {
      assistantResponse = `Okay, ${newOrderData.quantity || ''} ${newOrderData.product_name}. From which store? Amazon, Amazon Grocery, or Target?`;
    } else {
      assistantResponse = `Great! I'll order ${newOrderData.quantity || 1} ${newOrderData.product_name} from ${newOrderData.retailer}. Should I submit the order now? I can also open the website for you.`;
      setReadyToSubmit(true);
    }

    const assistantMessage = {
      role: 'assistant',
      text: assistantResponse,
      timestamp: new Date().toISOString()
    };
    const finalHistory = [...updatedHistory, assistantMessage];

    historyRef.current = finalHistory;
    setConversationHistory(finalHistory);

    // Speak
    webSpeechService.speak(assistantResponse);
    setIsProcessing(false);
  };

  const submitOrder = async () => {
    const data = orderDataRef.current;
    if (!data.product_name) {
      setError("Missing product name");
      return;
    }

    // LIVE PREVIEW: Open the website immediately in a new tab
    const productUrl = getProductUrl(data);
    if (productUrl) {
      window.open(productUrl, '_blank');
      webSpeechService.speak(`Opening ${data.retailer || 'the store'} to show you the product.`);
    }

    const orderPayload = {
      retailer: data.retailer || 'Amazon',
      automation_method: automationMethod,
      product: {
        name: data.product_name,
        url: productUrl || 'https://www.amazon.com/s?k=' + encodeURIComponent(data.product_name),
        quantity: data.quantity || 1,
        price: 0
      },
      customer_name: "Demo User",
      customer_email: "demo@example.com",
      shipping_address: {
        first_name: "Demo", last_name: "User",
        address_line_1: "123 Main St", city: "Seattle", state: "WA", postal_code: "98109", country: "US"
      },
      priority: "normal"
    };

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      if (response.ok) {
        const result = await response.json();
        webSpeechService.speak("Success! Order recorded in your dashboard.");
        onOrderCreated(result.order_id);

        // Brief delay before closing so user sees success
        setTimeout(() => {
          handleDismiss();
        }, 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`Submission failed: ${errorData.detail || 'Unknown error'}`);
        webSpeechService.speak("Sorry, there was an error submitting the order to the dashboard.");
      }
    } catch (e) {
      setError("Network error connecting to backend.");
      webSpeechService.speak("Sorry, I couldn't connect to the server.");
    }
  };

  const handleDismiss = () => {
    webSpeechService.stopListening();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    onDismiss();
  };

  const currentProductUrl = getProductUrl(orderData);

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header={<Header variant="h2">🎤 Voice Order Assistant</Header>}
      size="large"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={handleDismiss}>Cancel</Button>
            <Button variant="primary" onClick={submitOrder} disabled={!readyToSubmit}>Submit & Open Store</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">
        {error && <Alert type="error" dismissible onDismiss={() => setError(null)}>{error}</Alert>}

        <Container>
          <Box textAlign="center">
            {lastHeard && <Box margin={{ bottom: 's' }} color="text-status-info" variant="p">Heard: "<strong>{lastHeard}</strong>"</Box>}
            <SpaceBetween direction="horizontal" size="m">
              {!isRecording ? (
                <Button iconName="microphone" variant="primary" onClick={startListening} disabled={isProcessing}>
                  Click to Speak
                </Button>
              ) : (
                <Button iconName="status-stopped" onClick={stopListening}>
                  Listening... Click to Stop
                </Button>
              )}
              <Button onClick={startConversation}>Restart Assistant</Button>
            </SpaceBetween>
          </Box>
        </Container>

        <Container header={<Header variant="h3">Order Preview</Header>}>
          <ColumnLayout columns={3}>
            <div>
              <Box variant="awsui-key-label">Product</Box>
              <Box variant="strong">{orderData.product_name || <StatusIndicator type="warning">Identify Product...</StatusIndicator>}</Box>
              {orderData.product_name && (
                <div style={{ marginTop: '5px' }}>
                  <Link external href={currentProductUrl} target="_blank">View Live on {orderData.retailer || 'Store'}</Link>
                </div>
              )}
            </div>
            <div>
              <Box variant="awsui-key-label">Quantity</Box>
              <Box variant="strong">{orderData.quantity || <StatusIndicator type="warning">Check Qty...</StatusIndicator>}</Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Retailer</Box>
              <Box variant="strong">{orderData.retailer || <StatusIndicator type="warning">Choose Store...</StatusIndicator>}</Box>
            </div>
          </ColumnLayout>
        </Container>

        <ExpandableSection headerText="Conversation Log">
          <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            {conversationHistory.map((m, i) => (
              <Box key={i} margin={{ bottom: 's' }}>
                <Badge color={m.role === 'user' ? 'blue' : 'grey'}>{m.role === 'user' ? 'You' : 'Assistant'}</Badge>
                <Box padding={{ left: 'xxl' }} variant="p">{m.text}</Box>
              </Box>
            ))}
          </div>
        </ExpandableSection>
      </SpaceBetween>
    </Modal>
  );
};

export default VoiceOrderAssistant;
