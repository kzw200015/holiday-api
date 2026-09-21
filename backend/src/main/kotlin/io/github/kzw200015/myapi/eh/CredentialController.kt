package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.auth.CurrentUser
import io.github.kzw200015.myapi.eh.upstream.EhCredential
import io.github.kzw200015.myapi.web.ok
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** e 站凭据的绑定状态、绑定与解绑。 */
@RestController
@RequestMapping("/api/eh/credential")
class CredentialController(private val credentials: CredentialService) {
    @GetMapping
    fun status(@CurrentUser userId: Long) = ok(credentials.status(userId))

    @PostMapping
    fun bind(@CurrentUser userId: Long, @RequestBody credential: EhCredential) = ok(credentials.bind(userId, credential))

    @DeleteMapping
    fun unbind(@CurrentUser userId: Long) = ok(credentials.unbind(userId))
}
