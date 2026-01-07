// services/GoogleDriveAuthService.ts
import { IndexedDBService } from '@/services/IndexedDBService';
import { StorageService } from '@/services/StorageService';
import { generateCodeChallenge, generateRandomString } from './pkceUtils';

// OAuth Client type: Web application (exige client_secret même avec PKCE)
// Compromis serverless : secret exposé côté client mais protégé par redirect URIs
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;

// Note : Desktop app OAuth clients ne fonctionnent pas depuis le navigateur
// Pour sécurité maximale sans secret, il faudrait un backend proxy
// Actuellement : secret dans .env (pas hardcodé, pas committé, rotatable)

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class GoogleDriveAuthService {
    private static instance: GoogleDriveAuthService;
    private dbService: IndexedDBService | null = null;

    private constructor() { }

    public static async getInstance(): Promise<GoogleDriveAuthService> {
        if (!GoogleDriveAuthService.instance) {
            GoogleDriveAuthService.instance = new GoogleDriveAuthService();
            await GoogleDriveAuthService.instance.initialize();
        }
        return GoogleDriveAuthService.instance;
    }

    private async initialize() {
        this.dbService = await IndexedDBService.getInstance();
    }

    async getAccessToken(): Promise<string | null> {
        if (!this.dbService) return null;

        const accessToken = await this.dbService.getData('gdrive_access_token');
        const refreshToken = await this.dbService.getData('gdrive_refresh_token');
        const accessTokenExpireTimestamp = await this.dbService.getData('gdrive_access_token_expire_timestamp');
        const now = Date.now();

        if (accessToken && refreshToken && accessTokenExpireTimestamp && now < accessTokenExpireTimestamp) {
            return accessToken;
        } else if (refreshToken) {
            const tokenResponse = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    'client_id': CLIENT_ID,
                    'client_secret': CLIENT_SECRET,
                    'refresh_token': refreshToken,
                    'grant_type': 'refresh_token',
                }),
            });

            if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                await this.dbService?.saveData('gdrive_access_token', tokenData.access_token);
                await this.dbService?.saveData('gdrive_access_token_expire_timestamp', tokenData.expires_in * 1000 + Date.now());
                // Attempt initial hydration after silent refresh
                StorageService.getInstance().importFromRemote(['activities','activity_details','settings'])
                    .catch(err => console.warn('[GDrive] hydration after refresh failed', err));
                return tokenData.access_token;
            } else {
                console.error('Error refreshing access token:', await tokenResponse.text());
                return null;
            }
        } else {
            console.error('No valid access token or refresh token found.');
            return null;
        }
    }

    async getAccessTokenFromCode(code: string): Promise<string | null> {
        const state = localStorage.getItem("pkce_state");
        const code_verifier = localStorage.getItem("pkce_code_verifier");

        if (!state || !code_verifier) {
            console.error("State or code_verifier not found in local storage.");
            return null;
        }

        // Exchange the authorization code for an access token
        const tokenResponse = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'code': code,
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'redirect_uri': `${window.location.origin}${window.location.pathname}`,
                'grant_type': 'authorization_code',
                'code_verifier': code_verifier,
            }),
        });

        if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            this.dbService?.saveData('gdrive_access_token', tokenData.access_token);
            this.dbService?.saveData('gdrive_access_token_expire_timestamp', tokenData.expires_in * 1000 + Date.now());
            this.dbService?.saveData('gdrive_refresh_token', tokenData.refresh_token);

            window.history.replaceState({}, document.title, window.location.pathname);

            // Hydrate local stores now that we have first access token
            StorageService.getInstance().importFromRemote(['activities','activity_details','settings'])
                .catch(err => console.warn('[GDrive] initial hydration failed', err));

            return tokenData.access_token;
        } else {
            console.error('Error exchanging authorization code for access token:', await tokenResponse.text());
        }

        return null;
    }

    async getOauthSignInUri(): Promise<string | null> {
        var state = generateRandomString();
        localStorage.setItem("pkce_state", state);

        // Create and store a new PKCE code_verifier (the plaintext random secret)
        var code_verifier = generateRandomString();
        localStorage.setItem("pkce_code_verifier", code_verifier);

        // Hash and base64-urlencode the secret to use as the challenge
        var code_challenge = await generateCodeChallenge(code_verifier);
        console.log("redirect_uri", `${window.location.origin}${window.location.pathname}`);
        var url = AUTHORIZATION_ENDPOINT
            + "?response_type=code"
            + "&client_id=" + encodeURIComponent(CLIENT_ID)
            + "&state=" + encodeURIComponent(state)
            + "&access_type=offline"
            + "&prompt=consent"
            + "&scope=" + encodeURIComponent(SCOPE)
            + "&redirect_uri=" + encodeURIComponent(`${window.location.origin}${window.location.pathname}`)
            + "&code_challenge=" + encodeURIComponent(code_challenge)
            + "&code_challenge_method=S256"
            ;

        // Redirect to the authorization server
        return url;
    }

    async disconnect() {
        if (!this.dbService) return;
        await this.dbService.deleteData('gdrive_access_token');
        await this.dbService.deleteData('gdrive_refresh_token');
        await this.dbService.deleteData('gdrive_access_token_expire_timestamp');
    }
}
