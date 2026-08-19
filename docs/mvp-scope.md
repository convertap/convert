# Convert MVP. Project Scope

**Status:** Authoritative MVP scope. Where this document and [`product-spec.md`](./product-spec.md) (derived from the pitch deck) disagree, this document wins. Conflicts are catalogued in [`product-spec.md` §13, Deck vs. MVP Scope Reconciliation](./product-spec.md#13-deck-vs-mvp-scope-reconciliation).

**Last updated:** 2026-08-18

---

## 1. Project Overview

**Convert** is a mobile-first sales and lead management platform designed for Ghanaian SMEs. The product is intended to help businesses capture leads, organize sales opportunities, follow up consistently, communicate with prospects, and manage the sales process from one shared workspace.

The pitch deck positions Convert as a replacement for fragmented WhatsApp conversations, notebooks, spreadsheets, and disconnected sales tracking processes.

This project scope covers the work required to transform the existing Convert concept into a defined and usable **Minimum Viable Product (MVP)**.

The MVP will focus on proving that SMEs can use Convert to:

**Capture leads → organize them → assign and follow up → communicate → move opportunities through a sales pipeline → close or lose deals.**

---

## 2. Project Objective

The objective of this project is to design, build, and validate the first functional version of Convert.

The MVP should provide enough value for a selected group of SMEs to use the platform in their actual sales operations and provide feedback.

The project will specifically aim to validate whether businesses are willing to replace informal lead-management practices with a structured shared system.

---

## 3. MVP Product Goal

The MVP should allow an SME to manage its basic sales process from the moment a potential customer is identified until the opportunity is either won or lost.

The primary workflow:

```
Lead Captured
  ↓
Lead Added to Convert
  ↓
Lead Assigned
  ↓
Salesperson Contacts Lead
  ↓
Follow-up Activities Recorded
  ↓
Lead Qualified
  ↓
Deal Progresses Through Pipeline
  ↓
Deal Won / Lost
```

The pitch deck identifies lead capture, pipeline management, WhatsApp/SMS campaigns, and a mobile-first interface as the Phase 1 product scope.

---

## 4. Target MVP User

The initial MVP should primarily serve **small businesses with a small sales team**, while remaining usable by solo business owners.

The pitch deck describes three target groups:

- Solo business owners.
- Small businesses with approximately 2–5 sales representatives.
- Established SMEs scaling their sales operations.

For the MVP, the recommended primary target is:

### Growing SME Sales Team

A business with:

- 2–5 sales representatives.
- Leads coming from WhatsApp, referrals, social media, phone calls, or web forms.
- No reliable shared sales pipeline.
- Difficulty tracking follow-ups.
- Limited visibility into what sales representatives are doing.

This target provides enough complexity to validate Convert's team collaboration value without requiring enterprise-level functionality.

---

## 5. Organization and User Management

Businesses must be able to create and manage their Convert workspace.

### MVP capabilities

- Create business account.
- Create organization/workspace.
- Organization profile.
- Invite team members.
- Accept team invitations.
- View organization members.
- Activate or deactivate users.
- Assign basic user roles.

### Initial roles

**Owner / Administrator**. Can manage the organization, team members, leads, deals, pipelines, campaigns, and settings.

**Sales Representative**. Can manage assigned leads, deals, follow-ups, notes, and customer interactions.

More complex role-based access control can be introduced after MVP validation.

---

## 6. Contact Management

Contacts represent people or organizations the business sells to.

### MVP capabilities

- Create contacts manually.
- Edit contacts.
- Search contacts.
- View contact profiles.
- Record phone number.
- Record email address where available.
- Record company/business name.
- Add notes.
- View associated leads and deals.
- View activity history.
- Identify lead source.
- Assign contact ownership.

The platform should attempt to reduce duplicate customer records where possible.

---

## 7. Lead Capture

Lead capture is one of the primary capabilities of the MVP. The pitch deck proposes collecting leads from channels including WhatsApp, web forms, and Facebook/Instagram advertising.

### MVP lead sources

The first version should support:

- Manual lead creation.
- Web lead capture form.
- WhatsApp-originated lead identification where integration allows.
- Lead source selection.

Lead-source values:

- WhatsApp
- Facebook
- Instagram
- Website
- Referral
- Walk-in
- Phone
- Other

Direct automated Facebook/Instagram lead-ad synchronization may be introduced depending on implementation complexity and integration requirements.

---

## 8. Lead Management

Each lead should have a structured record.

### Lead information

- Customer/contact
- Lead source
- Assigned salesperson
- Lead status
- Date created
- Last contacted date
- Next follow-up
- Notes
- Activities
- Associated deal
- Lost reason where applicable

### Lead statuses

Initial workflow:

**New → Contacted → Qualified → Converted → Lost**

Final statuses to be confirmed during product-definition sessions.

---

## 9. Sales Pipeline and Deal Management

The sales pipeline is a core MVP capability. The deck proposes:

**New → Contacted → Qualified → Proposal → Won / Lost**

### MVP capabilities

- Create a deal.
- Assign a deal to a salesperson.
- Associate the deal with a contact.
- Enter estimated deal value.
- Move deals between stages.
- View deals using a Kanban pipeline.
- Open deal details.
- Add notes.
- Record activities.
- Set next follow-up.
- Mark deals as won.
- Mark deals as lost.
- Capture loss reason.

One default pipeline is provided for the first MVP. Custom pipelines are evaluated after validation.

---

## 10. Sales Activities

Convert maintains an activity history for every lead and deal.

### Activity types

- Call
- WhatsApp interaction
- SMS
- Meeting
- Note
- Follow-up
- Status change
- Deal-stage change

### Activity record

- Activity type
- User
- Date/time
- Notes or description

This creates organizational memory so customer relationships are not stored only on individual employees' phones, a problem explicitly identified in the product concept.

---

## 11. Follow-Up and Task Management

Missed follow-up is one of the central problems Convert addresses.

### MVP capabilities

- Create a follow-up task.
- Set follow-up date.
- Set follow-up time.
- Assign the task.
- Mark task as completed.
- View upcoming tasks.
- View overdue tasks.

The system should provide notifications or reminders when a follow-up becomes due.

---

## 12. WhatsApp Integration

WhatsApp is treated as a central communication channel because the product concept positions Convert as **WhatsApp-first**.

**The exact level of WhatsApp integration must be validated technically before production pilot launch.** Demo development may use Meta test credentials, a BSP sandbox, or a temporary third-party production-ready account.

All WhatsApp functionality must be implemented through a provider adapter so Meta test credentials, a third-party BSP, Meta Cloud API direct production access, or a future internal production provider can be swapped without rewriting contacts, leads, campaigns, tasks, activities, or dashboard logic.

### MVP target capabilities

Where supported:

- Store customer WhatsApp number.
- Launch a WhatsApp conversation from the contact record.
- Send approved WhatsApp templates.
- Associate outgoing communication with the customer record.
- Capture delivery/message status where available.

Full two-way inbox synchronization may be considered if supported by the selected WhatsApp provider and the MVP timeline.

---

## 13. SMS Communication

SMS provides a secondary messaging channel.

### MVP capabilities

- Send SMS to a contact.
- Use predefined message templates.
- Record sent SMS against customer activity.
- Track delivery status where supported by the provider.

Bulk campaign functionality remains limited during the first implementation unless required by pilot customers.

---

## 14. Basic Campaigns

The deck proposes WhatsApp and SMS campaigns as a core product capability. The MVP provides lightweight campaign functionality.

### MVP capabilities

- Create campaign.
- Give campaign a name.
- Select communication channel.
- Select contacts.
- Select or enter message.
- Schedule or send campaign.
- Track campaign status.
- View basic delivery results.

Advanced segmentation and marketing automation are outside the initial MVP scope.

---

## 15. Dashboard

The dashboard gives an owner or sales manager a quick understanding of business activity.

### MVP metrics

- Total leads
- New leads
- Qualified leads
- Active deals
- Won deals
- Lost deals
- Total pipeline value
- Won revenue
- Overdue follow-ups
- Leads by source
- Deals by salesperson

The deck ultimately expects Convert to show which marketing sources produce paying customers. Advanced attribution is developed later; the MVP begins with basic source tracking.

---

## 16. Notifications

### MVP events

- Lead is assigned.
- Deal is assigned.
- Follow-up becomes due.
- Follow-up is overdue.
- User is invited.
- Important deal status changes.

Initial implementation may use in-app notifications, with additional channels added later.

---

## 17. Search and Filtering

### Search coverage

- Contacts
- Leads
- Deals

### Filters

- Assigned salesperson
- Lead source
- Status
- Pipeline stage
- Date created
- Won/lost state

Advanced search is introduced after MVP validation.

---

## 18. Mobile-First User Experience

The pitch deck positions Convert as a mobile-first product for salespeople who primarily work from their phones. The MVP is therefore designed responsively from the beginning.

Main workflows must work effectively on:

- Mobile browsers
- Tablets
- Desktop browsers

**A native mobile application is not required for the initial MVP unless separately approved.**

---

## 19. MVP Product Areas

### Foundation
Authentication · Organizations · Users · Roles

### Customer Management
Contacts · Leads · Lead source

### Sales Management
Deals · Pipeline · Deal stages · Activities · Tasks · Follow-ups

### Communication
WhatsApp · SMS · Templates · Basic campaigns

### Insights
Dashboard · Basic sales analytics · Lead-source reporting

### Platform
Notifications · Search · Settings · Audit/activity history

---

## 20. Out of Scope for Initial MVP

Not required for the first MVP unless pilot validation shows they are essential:

- AI lead scoring
- AI sales recommendations
- Template marketplace
- Full accounting integrations
- Advanced CRM automation
- Complex workflow builders
- Multiple customizable pipelines
- Advanced permission systems
- Native mobile applications
- E-commerce integrations
- Enterprise SSO
- Complex marketing attribution
- Advanced reporting engine
- Full customer support/help-desk functionality

The deck places API integrations, payment collection, AI lead scoring, and the template marketplace in the later Scale phase.

---

## 21. Deferred Product Capabilities

Already present in the broader Convert concept, but following after the initial MVP:

### Quotations
Create quote · Add products/services · Add quantities and prices · Discounts · Taxes · Terms · Send quotation · Accept/reject quote · Convert quote to invoice

### Invoicing
Generate invoice · Send invoice · Track payment status · Partial payment · Outstanding balance

### Payments
Mobile money · Card · Bank transfer · Payment links

### Advanced Marketing
Audience segmentation · Campaign automation · Scheduled journeys · Conversion attribution · Cost-per-lead reporting

These should be designed conceptually during product discovery so the MVP architecture does not prevent their later introduction.

---

## 22. Product Discovery Work

Before feature development begins, the team conducts a short product-definition exercise with the product owner, converting assumptions in the pitch deck into explicit product rules.

### Customer journey

Walk through a realistic SME sales process:

**Lead → Contact → Qualification → Follow-up → Deal → Won/Lost**

### Business rules to decide

- Can one contact have multiple leads?
- Can one contact have multiple deals?
- Can multiple employees own the same deal?
- How are duplicate leads handled?
- Can stages be customized?
- Who can see another salesperson's leads?
- What happens to leads when a salesperson leaves?
- What constitutes a converted lead?
- When should a deal be created?
- What information is required before a deal can be won?
- What happens when a deal is lost?

These decisions are documented before implementation.

---

## 23. Technical Design Scope

Once product requirements are agreed, the development team produces a technical design covering:

- System architecture
- Application architecture
- Database design
- Multi-tenancy model
- Authentication and authorization
- API design
- Messaging integrations
- Notification architecture
- Background job processing
- Audit logging
- Error handling
- Observability
- Security
- Deployment architecture
- CI/CD
- Backup and recovery

The technical architecture should support expansion into later Convert functionality without prematurely building those features.

---

## 24. Proposed Core Domain Model

Initial entities:

- Organization
- User
- Organization Member
- Contact
- Lead
- Lead Source
- Deal
- Pipeline
- Pipeline Stage
- Activity
- Task
- Message
- Message Template
- Campaign
- Notification

Further entities are introduced only where required by validated requirements.

---

## 25. Delivery Phases

### Phase 1. Product Definition
Product vision refinement · Primary persona · Customer journey · Product workflows · Business rules · MVP boundaries · Role definition · Functional requirements

### Phase 2. UX and Product Design
Information architecture · User flows · Wireframes · Mobile-first layouts · Core screen designs · Design system foundations

Important screens: Login/signup · Dashboard · Contacts · Contact details · Leads · Pipeline · Deal details · Tasks · Campaigns · Team management · Settings

### Phase 3. Technical Design
Architecture document · Database/domain model · API specification · Integration design · Security design · Deployment strategy · Development environment

### Phase 4. MVP Implementation
Authentication · Organization management · User/team management · Contacts · Leads · Lead sources · Pipeline · Deals · Activities · Tasks · Follow-up reminders · WhatsApp/SMS integration · Basic campaigns · Notifications · Dashboard · Search/filtering

### Phase 5. Testing
Unit · Integration · API · End-to-end · Responsive/mobile · Security · Performance · User acceptance

### Phase 6. Pilot Launch
Recruit pilot businesses · Configure their organizations · Onboard users · Import initial contacts where necessary · Observe real usage · Gather structured feedback · Monitor errors and performance · Identify usability issues · Measure adoption

---

## 26. MVP Success Criteria

The MVP is not successful simply because all features have been developed. Success is based on product usage and business outcomes.

### Activation
Users successfully create an organization, add/import contacts, add leads, create deals, and record sales activities.

The pitch deck proposes measuring whether new customers add at least **10 contacts** and log at least **one deal** within **seven days**.

### Engagement
Active users · Leads updated · Follow-ups completed · Deals moved through pipeline · Messages sent

### Sales Outcomes
Lead-to-deal conversion · Deal win rate · Response times · Number of closed deals · Revenue recorded

### Retention
Whether pilot SMEs continue using Convert once the initial onboarding period ends.

---

## 27. Key Project Risks

| Risk | Mitigation |
|------|------------|
| Product scope becoming too broad | Maintain a strict distinction between Core MVP → Post-MVP → Future Product. |
| WhatsApp integration complexity | Validate provider capabilities, business verification requirements, messaging rules, templates, costs, and API constraints before depending heavily on WhatsApp functionality. |
| Low user adoption, reps keep using personal WhatsApp chats instead of updating Convert | Reduce manual data entry; make common workflows fast enough to use from a mobile phone. |
| Poor product-market fit | Launch with a small pilot cohort and use real usage to drive subsequent development. |
| Excessive architecture | Design for future growth while implementing only infrastructure required for the MVP. |

---

## 28. Definition of MVP Completion

The MVP is technically ready for pilot deployment when:

- A business can register.
- A business can create its organization.
- Team members can join.
- Contacts can be created and managed.
- Leads can be captured.
- Leads can be assigned.
- Leads can be followed up.
- Deals can be created.
- Deals can move through a pipeline.
- Activities can be recorded.
- Follow-up reminders work.
- Users can communicate with customers through supported messaging channels.
- Managers can see sales activity.
- Basic reporting is available.
- The primary workflows work effectively on mobile.
- Pilot users can complete the complete sales workflow without developer intervention.

---

## 29. Final MVP Boundary

The first Convert MVP concentrates on one central promise:

> **Give an SME one shared place to capture a potential customer, assign responsibility, follow up consistently, and track that opportunity until it becomes a sale or is lost.**

Everything that strengthens that workflow belongs in the MVP. Everything that does not directly contribute to proving that workflow is postponed.

The broader Convert product can eventually include quotations, invoicing, payments, advanced marketing automation, integrations, and AI capabilities, but the first product must validate the fundamental **lead-to-sale workflow** before expanding into the complete sales stack.
