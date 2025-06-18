// app.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import setupRoutes from "./routes.js";
import supabase from "./supabaseClient.js";

// ► Inicijalizacija Stripe klijenta
import Stripe from "stripe";
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

export const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health‐check ruta ───────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────
export const onlineUsers = new Map();
const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("⚡️ Socket connected, id:", socket.id);

  socket.on("registerUser", (userId) => {
    onlineUsers.set(userId, socket.id);
    console.log(`🔌 Registered user ${userId} on socket ${socket.id}`);
  });

  socket.on("disconnect", () => {
    for (const [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`🔌 Unregistered user ${userId}`);
        break;
      }
    }
  });
});

// ─── Rute ────────────────────────────────────────────────────────────────────
setupRoutes(app);

// ─── Test‐only ruta za reset baze ─────────────────────────────────────────────
if (process.env.TEST_MODE === "true") {
  app.delete("/api/test-utils/reset", async (req, res) => {
    try {
      await supabase.from("referrals").delete().neq("id", "");
      await supabase.from("activities").delete().neq("id", "");
      await supabase.from("users").delete().neq("id", "");
      await supabase.from("clubs").delete().neq("id", "");
      return res.status(200).json({ message: "Baza je resetirana." });
    } catch (err) {
      console.error("❌ Greška pri resetiranju baze:", err);
      return res.status(500).json({ error: "Greška pri resetiranju baze." });
    }
  });
}

export default server;
