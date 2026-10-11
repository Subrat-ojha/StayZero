# How accommodation services get inventory

Checked 2026-10-11. This is the sourcing decision behind StayZero's provider adapters.

| Pattern | Evidence | StayZero use |
|---|---|---|
| Provider-owned host network | [BeWelcome's FAQ](https://bewelcome.org/faq/2) describes searching members by location and sending stay requests. [Worldpackers' host FAQ](https://help.worldpackers.com/en/hc/initial-questions-about-being-a-worldpackers-host) says hosts offer accommodation and travellers pay a membership to apply. | Link to the provider's own search. Do not represent provider hosts as StayZero inventory. |
| Licensed commercial inventory | [Booking.com's Demand API](https://developers.booking.com/demand/docs/open-api/3.2/demand-api) serves affiliates; [its prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites) require a managed affiliate agreement and credentials. [Expedia Rapid](https://developers.expediagroup.com/rapid/setup) similarly requires approved partner access. | Build an API adapter only when the provider grants access and specifies display, attribution, refresh, and commercial-use terms. These hotel APIs do not establish access to free hospitality listings. |
| Direct supply | Providers can collect offers from hosts themselves, as Worldpackers' host FAQ shows. | A future StayZero host submission flow can create first-party inventory with publication consent and verification. It is outside this directory MVP. |

[Couchsurfing's terms](https://support.couchsurfing.org/hc/en-us/articles/360003344313-Terms-of-Use) restrict commercial use and data extraction. [Trustroots' safety page](https://www.trustroots.org/safety) says profiles and references are not identity guarantees. BeWelcome's [public code](https://github.com/BeWelcome) does not imply permission to reuse member data. I could not confirm a public unrestricted listings API for the hospitality exchange providers; this is a verification limit, not proof that partner access is impossible.

The MVP uses one `outbound-directory` adapter per provider in `src/lib/provider-adapters.ts`. Each returns a provider gateway for the chosen city, its access cost category, exchange terms, and an original URL. No adapter imports host profiles or claims live availability. The curated `Opportunity` seed stays separate and requires human source verification before its green badge appears.
