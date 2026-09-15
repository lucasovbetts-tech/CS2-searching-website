import { getMe, loginUrl, logout } from '../api/auth.js';

//Swaps the header's static "Sign in through Steam" box for the signed-in profile once /api/me
//comes back. The signed-out markup stays in index.html so it renders immediately rather than
//flashing empty while the request is in flight.
export async function initSteamAuth() {
    const box = document.querySelector('.steam-box');
    if (!box) return;

    box.addEventListener('click', () => {
        if (box.dataset.signedIn === 'true') return; //the logout button inside handles its own click
        window.location.href = loginUrl();
    });

    const user = await getMe();
    if (!user) return; //signed out - leave the existing markup as-is

    box.dataset.signedIn = 'true';
    box.innerHTML = `
        ${user.avatar ? `<img class="steam-avatar" src="${user.avatar}" alt="">` : ''}
        <span class="steam-user"></span>
        <button class="steam-logout" type="button" title="Sign out">Sign out</button>
    `;
    //textContent, not interpolated into the innerHTML above - Steam display names are chosen by
    //the user, so a name like <img src=x onerror=...> would otherwise run as markup
    box.querySelector('.steam-user').textContent = user.display_name ?? 'Signed in';

    box.querySelector('.steam-logout')?.addEventListener('click', e => {
        e.stopPropagation(); //without this the box's own handler fires and sends us back to Steam
        logout();
    });
}
