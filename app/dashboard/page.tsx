import type { Metadata } from "next";
import { HomeView } from "@/components/ws/home/home-view";

export const metadata: Metadata = { title: "Home" };

export default function DashboardHome() {
  return <HomeView />;
}
