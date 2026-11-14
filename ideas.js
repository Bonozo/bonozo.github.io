const ideaStatus = document.querySelector('#ideas-status');
const ideaList = document.querySelector('#ideas-list');
const ideaForm = document.querySelector('#idea-form');
const formStatus = document.querySelector('#idea-form-status');
const imageInput = document.querySelector('#idea-images');
const imageHelp = document.querySelector('#image-help');
const imagePreview = document.querySelector('#image-preview');
const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const imageHelpText = 'Up to 3 images, 2 MB each. JPG, PNG, or WebP.';
let previewUrls = [];

function updateImagePreview() {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
  imagePreview.replaceChildren();
  const files = Array.from(imageInput.files);
  const invalid = files.length > 3
    ? 'Choose no more than 3 images.'
    : files.some((file) => !imageTypes[file.type] || file.size === 0 || file.size > 2 * 1024 * 1024)
      ? 'Each image must be a non-empty JPG, PNG, or WebP no larger than 2 MB.'
      : '';
  imageInput.setCustomValidity(invalid);
  imageHelp.textContent = invalid || imageHelpText;
  if (invalid) return;
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.title = file.name;
    imagePreview.append(image);
  });
}

imageInput.addEventListener('change', updateImagePreview);

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
    if (data.session) return data.session;
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
    return result.data.session;
  }

  async function loadIdeas() {
    const { data, error } = await client.rpc('list_bot_ideas_with_images');
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
      const title = document.createElement('h3');
      title.textContent = idea.title;
      const description = document.createElement('p');
      description.textContent = idea.description;
      content.append(title, description);
      if (idea.images.length) {
        const gallery = document.createElement('div');
        gallery.className = 'idea-gallery';
        idea.images.forEach((path, imageIndex) => {
          const { data: imageData } = client.storage.from('idea-images').getPublicUrl(path);
          const link = document.createElement('a');
          link.href = imageData.publicUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.setAttribute('aria-label', `View image ${imageIndex + 1} for ${idea.title}`);
          const image = document.createElement('img');
          image.src = imageData.publicUrl;
          image.alt = '';
          image.loading = 'lazy';
          link.append(image);
          gallery.append(link);
        });
        content.append(gallery);
      }
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
    const uploadedPaths = [];
    let submittingIdea = false;
    try {
      const session = await visitorSession();
      const files = Array.from(imageInput.files);
      for (const [index, file] of files.entries()) {
        formStatus.textContent = `Uploading image ${index + 1} of ${files.length}...`;
        const path = `${session.user.id}/${crypto.randomUUID()}.${imageTypes[file.type]}`;
        uploadedPaths.push(path);
        const { error: uploadError } = await client.storage.from('idea-images').upload(path, file, {
          contentType: file.type,
          upsert: false
        });
        if (uploadError) throw uploadError;
      }
      formStatus.textContent = 'Submitting your idea...';
      submittingIdea = true;
      const { error } = await client.rpc('submit_bot_idea_with_images', {
        idea_title: title,
        idea_description: description,
        image_paths: uploadedPaths
      });
      if (error) throw error;
      ideaForm.reset();
      updateImagePreview();
      formStatus.textContent = 'Your idea is in! Thanks for sharing.';
      try {
        await loadIdeas();
      } catch (error) {
        console.error('Unable to refresh ideas:', error);
        ideaStatus.textContent = 'Your idea was submitted, but the board could not refresh. Please reload the page.';
      }
    } catch (error) {
      console.error('Unable to submit idea:', error);
      let cleanupFailed = false;
      if (uploadedPaths.length) {
        try {
          const { data, error: cleanupError } = await client.storage.from('idea-images').remove(uploadedPaths);
          cleanupFailed = Boolean(cleanupError || !data || data.length !== uploadedPaths.length);
          if (cleanupFailed) console.error('Unable to clean up all uploaded images:', cleanupError);
        } catch (cleanupError) {
          cleanupFailed = true;
          console.error('Unable to clean up uploaded images:', cleanupError);
        }
      }
      if (submittingIdea) {
        formStatus.textContent = error.message && error.message.includes('wait a minute') && !cleanupFailed
          ? 'Please wait a minute before submitting another idea.'
          : 'We could not confirm your submission. Check the board before trying again.';
      } else {
        formStatus.textContent = 'Could not upload your images or submit your idea. Please try again.';
      }
      if (cleanupFailed && !submittingIdea) {
        formStatus.textContent = 'Upload failed and some images may need cleanup. Please contact us before retrying.';
      }
    } finally {
      button.disabled = false;
    }
  });

  loadIdeas().catch((error) => {
    console.error('Unable to load ideas:', error);
    ideaStatus.textContent = 'The idea board could not load. Please refresh and try again.';
  });
}
