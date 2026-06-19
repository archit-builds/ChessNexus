import './global.css';

export const metadata = {
  title: 'ChessNexus',
  description: 'This is a go-to Chess RAG Chatbot',
    icons: {
    icon:"/assets/logochess.png", 
  }
};

import { ReactNode } from 'react';

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
};

export default RootLayout;