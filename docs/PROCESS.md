# Process Writeup: Building Canopy

Canopy began as a civic technology project for FE51: CCP Digital Balance at Minerva University. The challenge question was: how might we help students develop more intentional and healthy relationships with technology by reducing unconscious or habitual device usage? The final deliverable became a local-first desktop app that combines planning, passive activity tracking, AI-assisted classification, and real-time coaching.

This writeup focuses on the process behind the app: how the team moved from research and stakeholder input to a working prototype, how user feedback changed the design, and what parts of the work are most relevant for internship conversations.

## Problem Framing

The team started by treating digital distraction as a behavioral design problem rather than a simple screen-time problem. Many students do not want to use their devices less in an absolute sense; they need laptops and phones for classes, research, coordination, and creative work. The deeper issue is the intention-execution gap: a person plans to work on one thing, but their actual computer behavior gradually drifts somewhere else.

That framing shaped the product direction. Instead of building another blocker or timer, Canopy was designed to help users compare intended work with observed behavior. The goal was not to punish distraction or remove user autonomy. The goal was to make drift visible early enough that users could make a conscious choice.

## Research Grounding

The first phase focused on background research, civic partner input, and gap analysis. The team reviewed work on digital well-being, adolescent and student technology use, habit formation, online behavior, and mental health. This research helped distinguish between intentional technology use and habitual or unconscious use.

The team also evaluated existing solutions such as screen-time dashboards, app blockers, website blockers, grayscale tools, and productivity trackers. This revealed several gaps:

- Many tools measure time but do not ask whether that time matched the user's goal.
- Blocking tools can be easy to bypass and can create resistance because they remove control.
- Retrospective dashboards are useful for reflection but often arrive too late to change behavior in the moment.
- Cloud-based activity trackers raise privacy concerns because window titles, browsing context, and app usage can reveal sensitive personal information.

These insights led to a product thesis: a useful intervention should be contextual, real-time, transparent, and privacy-preserving. Canopy therefore pairs a calendar-style plan with observed activity, classifies activity relative to the user's stated intention, and stores user data locally.

## Stakeholder Input

The team worked with civic partner Ezza Naveed from #HalfTheStory, whose focus on digital well-being helped keep the project grounded in real user needs rather than purely technical novelty. Partner feedback pushed the team toward a supportive intervention model: nudges should guide users without shaming them or locking them out of tools they might genuinely need.

This was important because the app sits in a sensitive space. It watches computer activity, interprets behavior, and comments on whether the user is on task. That creates a responsibility to design for trust. As a result, privacy, transparency, and user control became core constraints rather than late-stage polish.

## Product Direction

The final concept was Canopy: a desktop app that lets a user plan blocks of focused work, passively captures computer activity through ActivityWatch, and compares the two. The user can see a single-day timeline with planned blocks beside captured activity. When classification is enabled, the app can label activity as on-task or off-task relative to the user's planned block and produce short coaching prompts when sustained drift is detected.

The product intentionally combines planning and measurement. A calendar alone records intentions. A tracker alone records behavior. Canopy's value is in reconciling the two.

## Prototyping and Technical Execution

The prototype moved beyond mockups into an end-to-end implementation. The app is built with Electron, React, TypeScript, SQLite, ActivityWatch, and optional OpenAI classification.

Key implementation decisions included:

- Using ActivityWatch for passive local activity capture instead of building a tracker from scratch.
- Storing planning, activity, and classification data in a local SQLite database.
- Aggregating activity at the minute level so the timeline is understandable and inspectable.
- Using OpenAI only for short structured classification calls, not for bulk activity storage.
- Keeping the app functional without an API key so planning and local tracking still work when AI features are disabled.
- Adding an evidence drawer so users can inspect the raw activity behind a classification.

From an engineering perspective, the core challenge was turning noisy activity data into a clear user-facing timeline. ActivityWatch can record many small events, rapid window switches, AFK periods, and incomplete data. Canopy normalizes this into minute-level records, picks a dominant app/title for each minute, flags low-confidence data for review, and stores enough metadata to support later reprocessing.

## User Testing and Iteration

After the initial concept and architecture were defined, the team used informal peer feedback and prototype walkthroughs to test whether the product made sense to likely users. Because of IRB constraints, the team shifted away from formal quantitative user studies and instead focused on showing mockups and early prototypes to peers, then observing confusion, concerns, and feature interest.

The most important feedback themes were:

- Raw tracking data felt overwhelming when shown without structure.
- Users were more interested in "planned vs actual" comparison than in another generic screen-time total.
- Privacy was a serious concern, especially around screenshots or overly detailed surveillance.
- The app needed to feel supportive and reflective, not punitive.

Those reactions directly changed the product. The team simplified the interface around a calendar-based visualization, prioritized inspectable evidence, and moved away from screenshot-based analysis toward metadata-based classification using app names, window titles, project context, and planned-block goals. This reduced intrusiveness while preserving the core behavior: checking whether the user's actual activity matched their intention.

User feedback also shaped the tone of coaching. Instead of harsh warnings or lockouts, Canopy uses short prompts designed to help the user take the next small step back toward the plan.

## Ethical and Privacy Decisions

Ethical design was a major part of the process because the app deals with sensitive behavioral data. The team made several privacy-first decisions:

- Keep persistent data local rather than storing activity history in a cloud service.
- Avoid screenshot-based tracking in favor of less intrusive metadata.
- Make activity evidence visible to the user so classifications are interpretable.
- Preserve autonomy by nudging rather than blocking.
- Allow the app to degrade gracefully when AI classification is disabled.

These decisions involved tradeoffs. Screenshots could provide more context for classification, but they would also make the tool much more invasive. A strict blocker might change behavior quickly, but it would also conflict with the team's research insight that students often need flexible, context-dependent technology use. The final design prioritized trust and long-term adoption over maximum control.

## Project Management and Collaboration

The team followed a staged process across the semester. Early work focused on defining the problem, reviewing research, and aligning with the civic partner. The middle phase focused on gap analysis, concept selection, and IRB considerations. The later phase focused on prototype development, peer feedback, technical iteration, and final presentation.

The development work was organized around a clear division of labor. Andrew led much of the prototype implementation, while the broader team contributed research synthesis, stakeholder communication, user feedback, presentation design, and final deliverable writing. Weekly meetings helped maintain accountability and gave the group a regular place to convert feedback into concrete next steps.

## Timeline

- Feb 8 to Feb 15: finalized the challenge question, aligned with the civic partner, and narrowed the project around intentional technology use.
- Feb 16 to Feb 28: conducted background research on digital well-being, habit formation, mental health, and existing intervention tools.
- Mar 1 to Mar 10: selected an awareness-based intervention and defined the first Canopy feature set: planning, tracking, classification, and feedback.
- Mar 11 to Mar 20: began prototype development, integrated ActivityWatch, built the early activity pipeline, and created the first rough interface.
- Mar 21 to Mar 28: shared early mockups and prototype flows with peers; feedback emphasized privacy, simplicity, and planned-vs-actual comparison.
- Mar 29 to Apr 5: shifted toward a clearer calendar visualization, minute-level aggregation, red/green classification, and metadata-based analysis.
- Apr 6 to Apr 12: refined the AI classification pipeline, improved reliability, and added real-time coaching prompts.
- Apr 13 to Apr 18: polished the interface, prepared the demo flow, and built the presentation narrative.
- Apr 20: presented the project at the symposium with a working demo.
- Apr 21 to Apr 23: completed final reflections, HC explanations, documentation, and deliverable materials.

## Internship-Relevant Takeaways

Canopy is useful as a portfolio project because it shows the full arc from ambiguous problem to shipped prototype.

The project demonstrates product thinking: the team did not begin with a preferred technology and search for a use case. It started with a behavioral problem, researched the surrounding system, identified gaps in current tools, and chose a product direction that fit user constraints.

It demonstrates human-centered iteration: user feedback changed the interface, the privacy model, the classification input, and the tone of interventions. The team learned that the app's value was not "more tracking" but clearer alignment between goals and behavior.

It demonstrates technical judgment: the implementation uses an existing open-source tracker for data collection, keeps sensitive data local, separates planning from activity capture, uses AI only where it adds contextual judgment, and includes a fallback mode when AI is unavailable.

It demonstrates ethical reasoning: the team treated privacy, autonomy, and transparency as core requirements. This matters for any internship involving user data, AI features, mental health, education, productivity, or behavior change.

It demonstrates execution: the final deliverable was not only a concept deck. It became a functional desktop app with a release build, setup instructions, a walkthrough, and documentation explaining how the system works.

## References Used in the Project

- Bear, H., Fazel, M., Skripkauskaite, S., & the OxWell Study Team. (2025). Isolation despite hyper-connectivity? The association between adolescents' mental health and online behaviours in a large study of school-aged students. Current Psychology, 44(8), 7124. https://doi.org/10.1007/s12144-025-07643-z
- Campbell, M., Edwards, E. J., Pennell, D., Poed, S., Lister, V., Gillett-Swan, J., Kelly, A., Zec, D., & Nguyen, T.-A. (2024). Evidence for and against banning mobile phones in schools: A scoping review. Journal of Psychologists and Counsellors in Schools, 34(3), 242-265. https://doi.org/10.1177/20556365241270394
- Klarin, J., Hoff, E., Larsson, A., & Daukantaite, D. (2024). Adolescents' use and perceived usefulness of generative AI for schoolwork: Exploring their relationships with executive functioning and academic achievement. Frontiers in Artificial Intelligence, 7. https://doi.org/10.3389/frai.2024.1415782
- Twenge, J. M. (2019). More time on technology, less happiness? Associations between digital-media use and psychological well-being. Current Directions in Psychological Science, 28(4), 372-379. https://doi.org/10.1177/0963721419838244
- Wang, T. R., Moosa, S., Dallapiazza, R. F., Elias, W. J., & Lynch, W. J. (2018). Deep brain stimulation for the treatment of drug addiction. Neurosurgical Focus, 45(2), E11. https://doi.org/10.3171/2018.5.FOCUS18163
