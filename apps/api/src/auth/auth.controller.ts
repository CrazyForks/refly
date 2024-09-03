import { Controller, Logger, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { User as UserModel } from '@prisma/client';

import { User } from '@/utils/decorators/user.decorator';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guard/local-auth.guard';
import { GithubOauthGuard } from './guard/github-oauth.guard';
import { GoogleOauthGuard } from './guard/google-oauth.guard';

@Controller('auth')
export class AuthController {
  private logger = new Logger(AuthController.name);

  constructor(private configService: ConfigService, private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@User() user: UserModel) {
    return this.authService.login(user);
  }

  @UseGuards(GithubOauthGuard)
  @Get('github')
  async github() {
    // auth guard will automatically handle this
  }

  @UseGuards(GoogleOauthGuard)
  @Get('google')
  async google() {
    // auth guard will automatically handle this
  }

  @UseGuards(GithubOauthGuard)
  @Get('callback')
  async githubAuthCallback(@User() user: UserModel, @Res() res: Response) {
    this.logger.log(`github oauth callback success, req.user = ${user.email}`);

    const { accessToken } = await this.authService.login(user);
    res
      .cookie(this.configService.get('auth.cookieTokenField'), accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      })
      .redirect(this.configService.get('auth.redirectUrl'));
  }

  @UseGuards(GoogleOauthGuard)
  @Get('callback/google')
  async googleAuthCallback(@User() user: UserModel, @Res() res: Response) {
    this.logger.log(`google oauth callback success, req.user = ${user.email}`);

    const { accessToken } = await this.authService.login(user);
    res
      .cookie(this.configService.get('auth.cookieTokenField'), accessToken, {
        domain: this.configService.get('auth.cookieDomain'),
      })
      .redirect(this.configService.get('auth.redirectUrl'));
  }
}
