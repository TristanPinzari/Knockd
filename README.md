# Knockd — Door-to-Door Team Coordination App
*Idea captured June 2026*

---

## The Problem

Small door-to-door sales crews (2–6 people) have no good way to coordinate in the field. The existing tools are either enterprise CRMs built for managers to monitor reps, or nothing. The day-to-day reality for a small crew looks like this:

- You split up to cover more ground, then have no idea where your teammate is or what streets they've already hit
- You end up knocking the same doors
- You're constantly texting "you guys done yet?" and physically regrouping to figure out next steps
- There's no shared picture of what's been covered and what hasn't

## The Idea

A lightweight, session-based map app for crews doing door-to-door work. No CRM, no manager dashboards, no enterprise pricing — just a shared live map that answers "where is everyone and what have they covered?"

**Core loop:**
1. Crew pulls up to an area
2. One person creates a session, shares a code
3. Everyone joins — each person appears as a different colored dot on the map
4. As people move, they leave a colored trail behind them
5. Streets get "painted" as they're covered — the map fills in visually as the crew works
6. Anyone can drop a pin to mark where they're heading next
7. Built-in group chat for coordination
8. Session ends when the crew is done for the day

## Why It's Different

Every existing app (SPOTIO, SalesRabbit, Knockio, Timeero, etc.) is built manager-down. A boss watches reps from a dashboard. They're CRM-first, $15–50/user/month, and overkill for a small informal crew.

This is peer-to-peer. Teammates see each other, not a manager seeing subordinates. The target user is a 3-person painting crew or summer sales team, not a 50-rep enterprise sales org. Free or near-free pricing.

## Key Features (MVP)

- Session creation with a shareable join code (no account required, just enter your name)
- Live map showing all teammates as colored dots
- Movement trails per person
- "Street painted" view — streets fill with color as someone walks them
- "Heading here" pin drops
- Group text chat
- Session auto-expires at end of day or when creator ends it

## Platform Requirement

**Must work on both iOS and Android.** This is non-negotiable. Door-to-door crews are mixed — some people have iPhones, some have Androids. An iOS-only or Android-only app kills the "whole crew joins a session" concept on day one. Every technical decision should be made with cross-platform in mind from the start, not bolted on later.

## Technical Approach

- React Native + Expo (cross-platform iOS/Android — satisfies the platform requirement above)
- Firebase Realtime Database for live location sync
- Google Maps SDK for the map layer
- Session/room pattern (same concept as Notify's session system)
- No backend complexity needed at MVP — Firebase can handle all of it

## Name & Domain

- Working name: **Knockd** — checked on App Store and Google Play, no conflicting app found
- knockd.com is available for purchase (check Namecheap/GoDaddy for price)
- knockdd.com is registered but abandoned (error page)
- getknockd.com or knockdapp.com are cheap fallback options
- Domain matters less than the app store presence for this type of product

## Market

Validated market (D2D software is a real category) but the lightweight peer-coordination niche is unserved. Target users: summer sales crews, painting companies, fundraising canvassers, political canvassing teams, small field sales teams. All informal, price-sensitive, coordination-heavy.

## Why I'm Shelving It (For Now)

- Notify takes priority — further along, real pitch lined up
- No mobile experience yet, need to get Expo basics first
- Door-to-door season is summer; want to be able to dogfood it myself
- Come back to this September/October, build over winter, ready for next summer

## Next Steps When Returning

- Spend a weekend getting comfortable with Expo
- Build the live location sharing piece as a standalone proof of concept
- Find a painting crew or sales team willing to beta test
- Consider the name — "painting the map" is literally what the app does and what the users do for work
