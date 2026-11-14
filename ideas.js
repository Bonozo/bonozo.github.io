const ideaStatus = document.querySelector('#ideas-status');
const ideaList = document.querySelector('#ideas-list');
const ideaForm = document.querySelector('#idea-form');
const formStatus = document.querySelector('#idea-form-status');

if (!window.supabase) {
  ideaStatus.textContent = 'The idea board could not load. Please refresh and try again.';
  ideaForm.querySelector('button').disabled = true;
} else {
  const client = window.supabase.createClient(
    'https://ekzvjhgofmjdmueoclbz.supabase.co',
    'sb_publishable_yOMEddyMBO9gBJIk62f_nw_-eWJZuLo'
  );

  async function visitorSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) return;
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
  }

  async function loadIdeas() {
    const { data, error } = await client.rpc('list_bot_ideas');
    if (error) throw error;
    ideaList.replaceChildren();
    ideaStatus.textContent = data.length ? '' : 'No ideas yet. Be the first to share one!';
    data.forEach((idea, index) => {
      const card = document.createElement('article');
      card.className = 'idea-card';
      const rank = document.createElement('span');
      rank.className = 'idea-rank';
      rank.textContent = String(index + 1).padStart(2, '0');
      const content = document.createElement('div');
      content.className = 'idea-card-content';
      const title = document.createElement('h4');
      title.textContent = idea.title;
      const description = document.createElement('p');
      description.textContent = idea.description;
      content.append(title, description);
      const vote = document.createElement('button');
      vote.type = 'button';
      vote.className = 'vote-button';
      vote.disabled = idea.has_voted;
      vote.setAttribute('aria-label', `${idea.has_voted ? 'Voted for' : 'Upvote'} ${idea.title}, ${idea.votes} votes`);
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '▲';
      const count = document.createElement('strong');
      count.textContent = idea.votes;
      vote.append(arrow, count);
      vote.addEventListener('click', async () => {
        vote.disabled = true;
        try {
          await visitorSession();
          const { error: voteError } = await client.rpc('vote_for_bot_idea', { target_id: idea.id });
          if (voteError) throw voteError;
          await loadIdeas();
        } catch (error) {
          console.error('Unable to vote:', error);
          ideaStatus.textContent = 'Could not complete the vote or refresh the board. Please try again.';
          vote.disabled = false;
        }
      });
      card.append(rank, content, vote);
      ideaList.append(card);
    });
  }

  ideaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = ideaForm.querySelector('button');
    const title = ideaForm.elements.title.value.trim();
    const description = ideaForm.elements.description.value.trim();
    if (title.length < 3 || description.length < 10) {
      formStatus.textContent = 'Please enter a name of at least 3 characters and an idea of at least 10 characters.';
      return;
    }
    button.disabled = true;
    formStatus.textContent = 'Submitting your idea...';
    try {
      await visitorSession();
      const { error } = await client.rpc('submit_bot_idea', { idea_title: title, idea_description: description });
      if (error) throw error;
      ideaForm.reset();
      formStatus.textContent = 'Your idea is in! Thanks for sharing.';
      try {
        await loadIdeas();
      } catch (error) {
        console.error('Unable to refresh ideas:', error);
        ideaStatus.textContent = 'Your idea was submitted, but the board could not refresh. Please reload the page.';
      }
    } catch (error) {
      console.error('Unable to submit idea:', error);
      formStatus.textContent = error.message && error.message.includes('wait a minute')
        ? 'Please wait a minute before submitting another idea.'
        : 'Could not submit your idea. Please try again.';
    } finally {
      button.disabled = false;
    }
  });

  loadIdeas().catch((error) => {
    console.error('Unable to load ideas:', error);
    ideaStatus.textContent = 'The idea board could not load. Please refresh and try again.';
  });
}
