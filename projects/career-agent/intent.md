# Intent — career-agent (public)

Applying for internships and early-career roles is two bad options: hand-tailor every CV and cover
letter (slow), or send the same generic one everywhere (ignored). career-agent is a third option for
one person running it on their own machine: it finds openings, cuts the ones you cannot apply to,
tailors a CV and cover letter per role from a single profile of true facts about you, and fills in
the application form — then stops, so you read it and press submit yourself.

**Who it is for:** a student or early-career applicant with a CV, Node installed, and either Claude
Code or a terminal. First shipped for a hands-on workshop, so a newcomer must get from `git clone` to
a complete profile in one sitting.

**The rule it is built around:** tailoring re-presents true things; it never invents. Every generated
claim must trace back to the user's own profile, and a runnable check (`npm run ground`) fails the
document if it does not.

**Not in scope:** submitting applications, LinkedIn automation, anything that acts under the user's
name without them reading it first.
