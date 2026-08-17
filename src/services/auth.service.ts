import { HydratedDocument } from "mongoose";
import { UserModel, IUser, Provider } from "../models/user.model.js";
import { createAccessToken, createRefreshToken } from "../core/security/jwt.js";
import { getKakaoToken, getKakaoUserInfo } from "./kakao.service.js";

interface LoginResult {
    accessToken: string;
    refreshToken: string;
    userId: string;
    nickname: string;
    theme: string;
    role: string;
    isNewUser: boolean;
}

export const loginWithKakao = async (code: string): Promise<LoginResult> => {
    const kakaoAccessToken = await getKakaoToken(code);
    const kakaoUser = await getKakaoUserInfo(kakaoAccessToken);

    const { user, isNewUser } = await findOrCreateUser(
        "kakao",
        kakaoUser.kakaoId,
        kakaoUser.nickname,
    );

    const accessToken = createAccessToken({ userId: user._id });
    const refreshToken = createRefreshToken({ userId: user._id });

    user.refresh_token = refreshToken;
    await user.save();

    return {
        accessToken,
        refreshToken,
        userId: user._id.toString(),
        nickname: user.nickname,
        theme: user.theme,
        role: user.role,
        isNewUser,
    };
};

export const findOrCreateUser = async (
    provider: Provider,
    providerId: string,
    nickname: string,
): Promise<{ user: HydratedDocument<IUser>; isNewUser: boolean }> => {
    const existingUser = await UserModel.findOne({
        provider,
        provider_id: providerId,
    });

    if (existingUser) {
        return { user: existingUser, isNewUser: false };
    }

    const newUser = await UserModel.create({
        provider,
        provider_id: providerId,
        nickname,
    });

    return { user: newUser, isNewUser: true };
};
