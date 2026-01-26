# Fix MVP Hardening: Chat CTAs, Dashboard Categorization, Travelers Footer

## Summary

- **Inline chat CTAs**: Leadership transfer target and hosted trip invitees see accept/decline banners above the chat composer. Invite takes priority over transfer when both apply.
- **Dashboard trip categorization**: Trips grouped into "Your trips" (leader), "Active trips", collapsible "Completed", and collapsible "Cancelled" sections per circle.
- **Travelers overlay fixed footer**: Transfer Leadership, Leave Trip, and Cancel Trip buttons always visible in a fixed footer regardless of traveler list length.

## Test Plan

- [ ] Transfer target sees amber accept/decline banner above chat composer; Accept/Decline work with toasts
- [ ] Invited user on hosted trip sees blue accept/decline banner; Accept/Decline work with toasts
- [ ] When both invite and transfer apply, invite CTA shows first
- [ ] Normal traveler sees no banner above composer
- [ ] Dashboard: leader trips shown first with crown icon, active trips next, completed/cancelled collapsible
- [ ] Travelers overlay: footer buttons visible without scrolling; traveler list scrolls independently
- [ ] No footer CTAs shown on cancelled trips

🤖 Generated with [Claude Code](https://claude.com/claude-code)
