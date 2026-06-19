"use client"
import Image from "next/image"
import type React from "react"

import { useState, useEffect, useRef } from "react"
import { PromptSuggestionRow } from "./components/PromptSuggestionRow"
import { LoadingBubble } from "./components/LoadingBubble"
import { Bubble } from "./components/Bubble"
import ReactMarkdown from "react-markdown"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

const Home = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handlePromptClick = (prompt: string) => {
    sendMessage(prompt)
  }

  const sendMessage = async (text: string) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    }

    // Update messages state immediately with the new user message
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setIsLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      })

      // Always show the response body as an assistant bubble —
      // this includes rate limit messages (429), errors (500), and normal replies
      const reply = await res.text()
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply || "Something went wrong. Please try again.",
      }
      setMessages((prevMessages) => [...prevMessages, assistantMessage])
    } catch (err) {
      // Network-level failure (e.g. server offline)
      console.error("Error sending message:", err)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "❌ Could not reach the server. Please check your connection and try again.",
      }
      setMessages((prevMessages) => [...prevMessages, errorMessage])
    } finally {
      setIsLoading(false)
      setInput("")
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage(input)
  }

  const noMessages = messages.length === 0

  return (
    <main>
      <div className="header">
        <Image src="/assets/logo-chess.png" width={250} height={250} alt="ChessGPT Logo" priority />
      </div>

      <section className={noMessages ? "" : "populated"}>
        {noMessages ? (
          <>
            <p className="starter-text">
              ♔ Welcome to ChessNexus ♔<br />
              Ask any chess-related question and get expert answers powered by AI
            </p>
            <PromptSuggestionRow onPromptClick={handlePromptClick} />
          </>
        ) : (
          <>
            {messages.map((message) => (
              <Bubble key={message.id} message={message}>
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </Bubble>
            ))}
            {isLoading && <LoadingBubble />}
            <div ref={messagesEndRef} />
          </>
        )}
      </section>

      <form onSubmit={handleSubmit}>
        <input
          className="question-box"
          onChange={(e) => setInput(e.target.value)}
          value={input}
          placeholder="Ask about chess strategies, openings, tactics..."
        />
        <input type="submit" value="Send" />
      </form>
    </main>
  )
}

export default Home