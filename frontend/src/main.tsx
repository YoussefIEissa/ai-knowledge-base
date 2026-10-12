import "@fontsource-variable/inter/index.css";
import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ChatProvider } from "./components/chat/ChatProvider";
import { ToastProvider } from "./components/ui/ToastProvider";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ChatProvider>
          <App />
        </ChatProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
