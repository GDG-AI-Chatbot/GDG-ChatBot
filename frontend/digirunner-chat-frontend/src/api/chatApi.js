import axios from "axios";

export const sendMessage = async (message) => {
  const res = await axios.post(
    "http://localhost:31080/api/chat",
    {
      query: message,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return res.data;
};
