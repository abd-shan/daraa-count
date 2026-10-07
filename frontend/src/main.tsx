import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
// Base tokens and primitives first, then the shell and page layouts, so a
// layout rule wins over a base rule of equal specificity.
import "./index.css";
import "./App.css";
import App from "./App.tsx";
import { store } from "./store.ts";
import { assertSameOrigin } from "./config.ts";

// Fail loudly on a misconfigured VITE_API_URL rather than at the first login.
assertSameOrigin();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
