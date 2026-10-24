import { useState, useEffect } from "react";
import { checkServer } from "./db";

// true only when the device has network AND the server answers
export default function useConnection() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = await checkServer();
      if (active) setOnline(ok);
    };
    check();
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    const timer = setInterval(check, 10000);
    return () => {
      active = false;
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      clearInterval(timer);
    };
  }, []);

  return online;
}